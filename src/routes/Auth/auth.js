const express = require("express");
const {
  signupUser,
  signInUser,
  resetPassword,
  requestPasswordReset,
  verifyOtp,
  // sendMobileOtp, // Commented out
  // verifySignupOtp, // Commented out
} = require("../../controllers/Auth/AuthController");
const upload = require("../../config/multerConfig");

const router = express.Router();

// Signup route with multer middleware for image upload
// Using fields to allow profileImage file and other form fields
router.post("/signup", upload.fields([{ name: "profileImage", maxCount: 1 }]), signupUser);
router.post("/signin", signInUser);
// Commented out OTP-related routes
// router.post("/send-mobile-otp", sendMobileOtp);
// router.post("/signup/verify-otp", verifySignupOtp);

router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/verify-otp", verifyOtp);

module.exports = router;
