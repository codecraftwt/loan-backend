const express = require("express");
const {
  signupUser,
  signInUser,
  resetPassword,
  requestPasswordReset,
  verifyOtp,
} = require("../../controllers/Auth/AuthController");

const router = express.Router();

router.post("/signup", signupUser);
router.post("/signin", signInUser);

router.post("/forgot-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/verify-otp", verifyOtp);

module.exports = router;
