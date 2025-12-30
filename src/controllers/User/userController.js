const User = require("../../models/User");
const Loan = require("../../models/Loan");
const cloudinary = require("../../config/cloudinaryConfig");
const { default: mongoose } = require("mongoose");
const { sendMobileNumberChangeNotification } = require("../../services/notificationService");

// Update Profile API
const updateProfile = async (req, res) => {
  const { userName, email, mobileNo, address } = req.body.userData;
  const userId = req.user.id; // Get user ID from the decoded token

  try {
    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    // Store old mobile number if mobile number is being changed
    const oldMobileNo = user.mobileNo;
    const mobileNoChanged = mobileNo && mobileNo !== oldMobileNo;

    if (userName) user.userName = userName;
    if (email) user.email = email;
    if (mobileNo) user.mobileNo = mobileNo;
    if (address) user.address = address;

    await user.save();

    // If mobile number changed and user is a borrower, notify all lenders who have loans with this borrower
    if (mobileNoChanged && user.roleId === 2 && user.aadharCardNo) {
      try {
        // Find all loans for this borrower using their Aadhaar number
        const loans = await Loan.find({ aadhaarNumber: user.aadharCardNo }).select('lenderId');
        
        // Get unique lender IDs
        const lenderIds = [...new Set(loans.map(loan => loan.lenderId.toString()))];

        // Send notification to each lender
        const notificationPromises = lenderIds.map(lenderId => {
          return sendMobileNumberChangeNotification(
            lenderId,
            user.userName,
            oldMobileNo,
            mobileNo
          ).catch(error => {
            console.error(`Error notifying lender ${lenderId}:`, error);
          });
        });

        // Wait for all notifications to be sent (non-blocking)
        await Promise.all(notificationPromises);
      } catch (notificationError) {
        // Don't fail the request if notification fails
        console.error("Error sending mobile number change notifications:", notificationError);
      }
    }

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        _id: user._id,
        userName: user.userName,
        email: user.email,
        mobileNo: user.mobileNo,
        address: user.address,
        aadharCardNo: user.aadharCardNo,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

const uploadProfileImage = async (req, res) => {
  const userId = req.user.id; 

  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded." });
  }

  try {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "Loan_user_profiles",
        public_id: `${userId}_profile_image`,
        resource_type: "image",
      },
      async (error, result) => {
        if (error) {
          return res.status(500).json({
            message: "Server error while uploading to Cloudinary",
            error: error.message,
          });
        }
        const imageUrl = result.secure_url;

        const user = await User.findById(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found." });
        }

        user.profileImage = imageUrl;

        await user.save();

        return res.status(200).json({
          message: "Profile image updated successfully.",
          user: {
            _id: user._id,
            userName: user.userName,
            email: user.email,
            mobileNo: user.mobileNo,
            address: user.address,
            aadharCardNo: user.aadharCardNo,
            profileImage: user.profileImage,
          },
        });
      }
    );

    stream.end(req.file.buffer);
  } catch (error) {
    console.error("Error uploading profile image:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

const deleteProfileImage = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId);
    if (!user || !user.profileImage) {
      return res.status(400).json({ message: "No profile image to delete." });
    }

    const publicId = `Loan_user_profiles/${userId}_profile_image`;

    const cloudinaryResult = await cloudinary.uploader.destroy(publicId);

    if (cloudinaryResult.result !== "ok") {
      return res
        .status(500)
        .json({ message: "Error deleting image from Cloudinary." });
    }

    user.profileImage = null;
    await user.save();

    res.status(200).json({ message: "Profile image deleted successfully." });
  } catch (error) {
    console.error("Error deleting profile image:", error.message);
    res
      .status(500)
      .json({ message: "Error deleting profile image.", error: error.message });
  }
};

const getUserDataById = async (req, res) => {
  const userId = req.user.id; // Get user ID from the decoded token

  try {
    // Find the user by ID
    const user = await User.findById(userId).select("-password"); // Exclude password field from the response
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      message: "User data fetched successfully.",
      user: {
        _id: user._id,
        userName: user.userName,
        email: user.email,
        mobileNo: user.mobileNo,
        address: user.address,
        aadharCardNo: user.aadharCardNo,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// This function is called to register or update the device token when the user logs in or opens the app
const registerDeviceToken = async (req, res) => {
  const { userId, deviceToken } = req.body; 

  if (!userId || !deviceToken) {
    return res
      .status(400)
      .json({ message: "User ID and device token are required" });
  }

  try {
    // Find the user and add the new device token to the array
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if the deviceToken is already in the array
    if (!user.deviceTokens.includes(deviceToken)) {
      user.deviceTokens.push(deviceToken);
      await user.save();
    }

    return res
      .status(200)
      .json({ message: "Device token registered successfully", user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error registering device token" });
  }
};

const removeDeviceToken = async (req, res) => {
  const { deviceToken } = req.body;
  const userId = req.user.id;

  if (!userId || !deviceToken) {
    return res
      .status(400)
      .json({ message: "User ID and device token are required" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove the token from the deviceTokens array
    user.deviceTokens = user.deviceTokens.filter(
      (token) => token !== deviceToken
    );
    await user.save();

    return res
      .status(200)
      .json({ message: "Device token removed successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error removing device token" });
  }
};

module.exports = {
  updateProfile,
  uploadProfileImage,
  getUserDataById,
  deleteProfileImage,
  registerDeviceToken,
  removeDeviceToken
};
