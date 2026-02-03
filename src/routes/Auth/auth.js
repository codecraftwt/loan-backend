const express = require("express");
const {
  signupUser,
  signInUser,
  resetPassword,
  requestPasswordReset,
  resendPasswordResetOtp,
  verifyOtp,
} = require("../../controllers/Auth/AuthController");
const upload = require("../../config/multerConfig");

const router = express.Router();

router.post("/signup", upload.fields([{ name: "profileImage", maxCount: 1 }]), signupUser);
router.post("/signin", signInUser);
router.post("/forgot-password", requestPasswordReset);
router.post("/resend-otp", resendPasswordResetOtp);
router.post("/reset-password", resetPassword);
router.post("/verify-otp", verifyOtp);

module.exports = router;
