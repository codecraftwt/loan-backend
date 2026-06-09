const express = require("express");
const router = express.Router();

const {
  sendPinResetOtp,
  verifyPinResetOtp,
  resetPin,
} = require("../../controllers/Auth/otpController");

router.post("/send-pin-reset-otp", sendPinResetOtp);
router.post("/verify-pin-reset-otp", verifyPinResetOtp);
router.post("/reset-pin", resetPin);

module.exports = router;
