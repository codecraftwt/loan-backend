const express = require("express");
const {
  updateProfile,
  uploadProfileImage,
  getUserDataById,
  deleteProfileImage,
  registerDeviceToken,
  removeDeviceToken,
  changePassword,
} = require("../controllers/User/userController");
const authenticateUser = require("../middlewares/authenticateUser");
const upload = require("../config/multerConfig");

const router = express.Router();

router.get("/user-data", authenticateUser, getUserDataById);

// Route to update profile (protected route)
router.patch("/update-profile", authenticateUser, updateProfile);

// Route to change password (protected route - all roles)
// router.patch("/change-password", authenticateUser, changePassword);
router.post("/change-password", authenticateUser, changePassword);

// Route for uploading profile image
router.post(
  "/uploadProfileImage",
  authenticateUser,
  upload.single("profileImage"),
  uploadProfileImage
);

router.delete("/delete-profile-image", authenticateUser, deleteProfileImage);

router.post("/register-device-token", registerDeviceToken);

router.post("/remove-device-token", authenticateUser, removeDeviceToken);

module.exports = router;