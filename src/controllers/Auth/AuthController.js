const jwt = require("jsonwebtoken");
const User = require("../../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
// const twilio = require("twilio");
const { sendVerificationEmail } = require("../../utils/mailer");
const {
  validateEmail,
  normalizeIndianMobile,
} = require("../../utils/authHelpers");
const cloudinary = require("../../config/cloudinaryConfig");

// Commented out Twilio configuration
// const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
// const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
// const twilioClient =
//   twilioAccountSid && twilioAuthToken
//     ? twilio(twilioAccountSid, twilioAuthToken)
//     : null;

// In-memory store for pending signups awaiting OTP verification
// const pendingSignups = {};

// Commented out Twilio functions
// function assertTwilioConfig() {
//   if (!twilioAccountSid || !twilioAuthToken) {
//     throw new Error(
//       "Twilio config missing. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
//     );
//   }
//   if (!twilioClient) {
//     throw new Error("Twilio client is not initialized");
//   }
// }

// async function sendTwilioOtp(phoneNumber, code) {
//   assertTwilioConfig();
//   const from = process.env.TWILIO_FROM_NUMBER;
//   if (!from) {
//     console.warn(
//       "TWILIO_FROM_NUMBER not set. OTP will not be sent via SMS, only returned in response."
//     );
//     return null;
//   }

//   return twilioClient.messages.create({
//     body: `Your verification code is ${code}`,
//     to: phoneNumber,
//     from,
//   });
// }

// Signup - create user directly without OTP verification
const signupUser = async (req, res) => {
  const {
    email,
    userName,
    password,
    confirmPassword,
    address,
    aadharCardNo,
    mobileNo,
    panCardNumber,
    roleId,
  } = req.body;

  try {
    const missingFields = [];
    if (!userName) missingFields.push("userName");
    if (!email) missingFields.push("email");
    if (!password) missingFields.push("password");
    if (!confirmPassword) missingFields.push("confirmPassword");
    if (!address) missingFields.push("address");
    if (!aadharCardNo) missingFields.push("aadharCardNo");
    if (!mobileNo) missingFields.push("mobileNo");
    if (roleId === undefined || roleId === null) missingFields.push("roleId");

    if (missingFields.length) {
      return res.status(400).json({
        message: "Missing required fields",
        missingFields,
      });
    }

    if (!validateEmail(email)) {
      return res
        .status(400)
        .json({ message: "Please provide a valid email address" });
    }

    // Validate Aadhar number - must be exactly 12 digits, only numbers, no special characters
    const trimmedAadhar = aadharCardNo.trim();
    if (!/^\d{12}$/.test(trimmedAadhar)) {
      return res
        .status(400)
        .json({ message: "Aadhar card number must be exactly 12 digits (numbers only, no special characters)" });
    }

    if (![0, 1, 2].includes(Number(roleId))) {
      return res
        .status(400)
        .json({ message: "roleId must be 0 (admin), 1 (lender) or 2 (borrower)" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const normalizedMobile = normalizeIndianMobile(mobileNo);
    if (!normalizedMobile) {
      return res
        .status(400)
        .json({ message: "Please provide a valid Indian mobile number" });
    }

    const normalizedEmail = email ? email.toLowerCase() : undefined;

    // Use trimmed Aadhar for duplicate check
    const checks = await Promise.all([
      normalizedEmail ? User.findOne({ email: normalizedEmail }) : null,
      User.findOne({ mobileNo: normalizedMobile.e164 }),
      User.findOne({ aadharCardNo: trimmedAadhar }),
      panCardNumber ? User.findOne({ panCardNumber }) : null,
    ]);

    const [userExists, mobileExists, aadharExists, panExists] = checks;

    if (userExists) {
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }
    if (mobileExists) {
      return res
        .status(400)
        .json({ message: "Mobile number is already in use" });
    }
    if (aadharExists) {
      return res
        .status(400)
        .json({ message: "Aadhar card number is already registered" });
    }
    if (panExists) {
      return res.status(400).json({ message: "PAN card number is in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Handle image upload from formdata
    let profileImageUrl = null;
    // Check for file in req.files (when using upload.fields) or req.file (when using upload.single)
    const profileImageFile = req.files?.profileImage?.[0] || req.file;
    if (profileImageFile) {
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: "Loan_user_profiles",
              resource_type: "image",
            },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            }
          );
          stream.end(profileImageFile.buffer);
        });
        profileImageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.error("Error uploading image to Cloudinary:", uploadError);
        return res.status(500).json({
          message: "Error uploading profile image",
          error: uploadError.message,
        });
      }
    }

    // Create user directly without OTP verification
    const newUser = new User({
      email: normalizedEmail,
      userName,
      password: hashedPassword,
      address,
      aadharCardNo: trimmedAadhar, // Use trimmed Aadhar (only digits)
      mobileNo: normalizedMobile.e164,
      panCardNumber,
      profileImage: profileImageUrl,
      roleId,
      isMobileVerified: true, // Set to true since we're skipping OTP verification
    });

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        _id: newUser._id,
        email: newUser.email,
        userName: newUser.userName,
        address: newUser.address,
        aadharCardNo: newUser.aadharCardNo,
        mobileNo: newUser.mobileNo,
        panCardNumber: newUser.panCardNumber,
        profileImage: newUser.profileImage,
        roleId: newUser.roleId,
        isMobileVerified: newUser.isMobileVerified,
      },
      token,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
};

const signInUser = async (req, res) => {
  const { emailOrMobile, password } = req.body;

  try {
    if (!emailOrMobile || !password) {
      return res.status(400).json({
        message: "Please provide email or mobile number, and password.",
      });
    }

    let user;
    const normalizedMobile = normalizeIndianMobile(emailOrMobile);

    if (validateEmail(emailOrMobile)) {
      user = await User.findOne({ email: emailOrMobile.toLowerCase() });
    } else if (normalizedMobile) {
      user = await User.findOne({ mobileNo: normalizedMobile.e164 });
    } else {
      return res.status(400).json({
        message:
          "Invalid input. Please provide a valid email or Indian mobile number.",
      });
    }

    if (!user) {
      return res.status(401).json({
        message:
          "Invalid credentials, please check your email or mobile number and password.",
      });
    }

    // Compare provided password with hashed password in the database
    const isMatch = await bcrypt.compare(password.trim(), user.password);

    if (!isMatch) {
      return res.status(401).json({
        message:
          "Invalid password, please check your email or mobile number and password.",
      });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "30d",
    });

    // Send response with user details and JWT token
    return res.status(200).json({
      _id: user._id,
      email: user.email,
      userName: user.userName,
      address: user.address,
      aadharCardNo: user.aadharCardNo,
      mobileNo: user.mobileNo,
      profileImage: user.profileImage,
      roleId: user.roleId,
      isMobileVerified: user.isMobileVerified,
      token,
    });
  } catch (error) {
    console.error("Error in signInUser:", error);
    return res.status(500).json({
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Commented out sendMobileOtp function
// const sendMobileOtp = async (req, res) => {
//   const { mobileNo } = req.body;

//   try {
//     const normalizedMobile = normalizeIndianMobile(mobileNo);
//     if (!normalizedMobile) {
//       return res
//         .status(400)
//         .json({ message: "Please provide a valid Indian mobile number" });
//     }

//     const alreadyExists = await User.findOne({
//       mobileNo: normalizedMobile.e164,
//     });
//     if (alreadyExists) {
//       return res
//         .status(400)
//         .json({ message: "Mobile number is already registered" });
//     }

//     const otp = Math.floor(100000 + Math.random() * 900000).toString();
//     await sendTwilioOtp(normalizedMobile.e164, otp);

//     return res.status(200).json({
//       message: "OTP sent successfully",
//       mobileNo: normalizedMobile.e164,
//       otp, // for development/testing only
//     });
//   } catch (error) {
//     console.error("Error sending mobile OTP:", error);
//     return res.status(500).json({
//       message: "Unable to send OTP",
//       error: error.message,
//     });
//   }
// };

// Commented out verifySignupOtp function
// Step 2: Verify OTP and create the user
// const verifySignupOtp = async (req, res) => {
//   const { mobileNo, otp } = req.body;

//   try {
//     if (!mobileNo || !otp) {
//       return res
//         .status(400)
//         .json({ message: "mobileNo and otp are required" });
//     }

//     const normalizedMobile = normalizeIndianMobile(mobileNo);
//     if (!normalizedMobile) {
//       return res
//         .status(400)
//         .json({ message: "Please provide a valid Indian mobile number" });
//     }

//     const pending = pendingSignups[normalizedMobile.e164];
//     if (!pending) {
//       return res
//         .status(400)
//         .json({ message: "No pending signup for provided mobile number" });
//     }

//     if (pending.otp !== otp) {
//       return res
//         .status(400)
//         .json({ message: "OTP verification failed or code is invalid" });
//     }

//     // Double-check uniqueness at verification time
//     const checks = await Promise.all([
//       pending.email ? User.findOne({ email: pending.email }) : null,
//       User.findOne({ mobileNo: pending.mobileNo }),
//       User.findOne({ aadharCardNo: pending.aadharCardNo }),
//       User.findOne({ userName: pending.userName }),
//       pending.panCardNumber
//         ? User.findOne({ panCardNumber: pending.panCardNumber })
//         : null,
//     ]);

//     const [userExists, mobileExists, aadharExists, userNameExists, panExists] =
//       checks;

//     if (userExists) {
//       return res
//         .status(400)
//         .json({ message: "User with this email already exists" });
//     }
//     if (mobileExists) {
//       return res
//         .status(400)
//         .json({ message: "Mobile number is already in use" });
//     }
//     if (aadharExists) {
//       return res
//         .status(400)
//         .json({ message: "Aadhar card number is already registered" });
//     }
//     if (userNameExists) {
//       return res.status(400).json({ message: "Username is already taken" });
//     }
//     if (panExists) {
//       return res.status(400).json({ message: "PAN card number is in use" });
//     }

//     const newUser = new User({
//       ...pending,
//       isMobileVerified: true,
//     });

//     await newUser.save();
//     delete pendingSignups[normalizedMobile.e164];

//     return res.status(201).json({
//       message: "User registered successfully",
//       user: {
//         _id: newUser._id,
//         email: newUser.email,
//         userName: newUser.userName,
//         address: newUser.address,
//         aadharCardNo: newUser.aadharCardNo,
//         mobileNo: newUser.mobileNo,
//         panCardNumber: newUser.panCardNumber,
//         profileImage: newUser.profileImage,
//         roleId: newUser.roleId,
//         isMobileVerified: newUser.isMobileVerified,
//       },
//     });
//   } catch (error) {
//     console.error("Error in verifySignupOtp:", error);
//     return res.status(500).json({
//       message: "Unable to verify OTP",
//       error: error.message,
//     });
//   }
// };

let verificationCodes = {};

const requestPasswordReset = async (req, res) => {
  const { email } = req.body;

  try {
    // Check if the user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User with this email not found." });
    }

    // Generate a 6-digit OTP (One-Time Password)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP temporarily (or you can store in the DB for persistence)
    verificationCodes[email] = otp;

    // Send OTP email to the user
    await sendVerificationEmail(email, otp);

    // Respond to the user
    res.status(200).json({ message: "Verification code sent to your email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Check if the OTP matches the stored OTP for this email
    if (verificationCodes[email] !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // If OTP is valid, proceed to reset the password.
    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    // Check if OTP is valid
    if (verificationCodes[email] !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // Check if the user exists in the database
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the new password before storing it in the DB
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user's password in the database
    user.password = hashedPassword;
    await user.save();

    // Optionally, remove the OTP after it's used
    delete verificationCodes[email];

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  signupUser,
  signInUser,
  requestPasswordReset,
  resetPassword,
  verifyOtp,
  // sendMobileOtp, // Commented out
  // verifySignupOtp, // Commented out
};
