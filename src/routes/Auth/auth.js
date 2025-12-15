const express = require("express");
const {
  signupUser,
  signInUser,
  resetPassword,
  requestPasswordReset,
  verifyOtp,
  sendMobileOtp,
  verifySignupOtp,
} = require("../../controllers/Auth/AuthController");

const router = express.Router();

router.post("/signup", signupUser);
router.post("/signin", signInUser);
router.post("/send-mobile-otp", sendMobileOtp);
router.post("/signup/verify-otp", verifySignupOtp);

router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/verify-otp", verifyOtp);

module.exports = router;
