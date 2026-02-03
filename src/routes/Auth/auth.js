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

// Diagnostic endpoint to check email configuration (remove in production if needed)
router.get("/check-email-config", (req, res) => {
  const email = process.env.EMAIL || process.env.GMAIL_EMAIL || process.env.GMAIL_USER;
  const password = process.env.EMAIL_PASSWORD || process.env.MAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  const resendKey = process.env.RESEND_API_KEY;
  
  res.json({
    status: "Email Configuration Check",
    gmail: {
      emailSet: !!email,
      emailPreview: email ? email.substring(0, 5) + "***@***" : "NOT SET",
      passwordSet: !!password,
      passwordLength: password ? password.length : 0,
      // Gmail App Password should be 16 chars (with spaces: 19 chars like "xxxx xxxx xxxx xxxx")
      passwordFormatValid: password ? (password.replace(/\s/g, "").length === 16) : false,
    },
    resend: {
      apiKeySet: !!resendKey,
    },
    recommendation: !email || !password 
      ? "Gmail credentials not set. Add EMAIL and EMAIL_PASSWORD to Render environment variables."
      : password.replace(/\s/g, "").length !== 16
        ? "EMAIL_PASSWORD should be 16 characters (Gmail App Password). Current length without spaces: " + password.replace(/\s/g, "").length
        : "Gmail configuration looks correct. If still failing, Gmail may be blocking the server IP. Consider using Resend as alternative.",
  });
});

module.exports = router;
