const {
  generateTransactionId,
  validateAadhaar,
  getMockKycData,
} = require("../../utils/helpers");

const otpStore = new Map();

// Clean up expired OTPs every hour
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of otpStore.entries()) {
      if (now > value.expiresAt) {
        otpStore.delete(key);
      }
    }
  },
  60 * 60 * 1000,
);

const sendOtp = async (req, res) => {
  try {
    const { aadhaarNumber, consentAccepted } = req.body;

    // Validation
    if (!aadhaarNumber) {
      return res.status(400).json({
        success: false,
        message: "Aadhaar number is required",
      });
    }

    if (!validateAadhaar(aadhaarNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Aadhaar number. Must be 12 digits.",
      });
    }

    if (consentAccepted !== true) {
      return res.status(400).json({
        success: false,
        message: "Consent is required for Aadhaar verification",
      });
    }

    const transactionId = generateTransactionId();
    const staticOtp = "123456";

    // Store with BOTH transactionId AND aadhaarNumber linked
    otpStore.set(transactionId, {
      aadhaarNumber: aadhaarNumber, // Store the original Aadhaar
      otp: staticOtp,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
      verified: false,
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      transactionId: transactionId,
      ...(process.env.NODE_ENV !== "production" && { testOtp: staticOtp }),
    });
  } catch (error) {
    console.error("Send OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { aadhaarNumber, otp, transactionId } = req.body;

    // Validation
    if (!aadhaarNumber || !otp || !transactionId) {
      return res.status(400).json({
        success: false,
        message: "Aadhaar number, OTP, and transaction ID are required",
      });
    }

    if (!validateAadhaar(aadhaarNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Aadhaar number",
      });
    }

    // Get session
    const session = otpStore.get(transactionId);

    // Check if transaction exists
    if (!session) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired transaction. Please request a new OTP.",
      });
    }

    // CRITICAL FIX: Validate Aadhaar number matches the one in session
    if (session.aadhaarNumber !== aadhaarNumber) {
      console.log(
        `[SECURITY] Aadhaar mismatch! Session: ${session.aadhaarNumber}, Request: ${aadhaarNumber}`,
      );
      return res.status(403).json({
        success: false,
        message:
          "Transaction ID does not belong to this Aadhaar number. Please request a new OTP.",
      });
    }

    // Check if already verified
    if (session.verified) {
      return res.status(400).json({
        success: false,
        message: "This transaction has already been verified",
      });
    }

    // Check expiration
    if (Date.now() > session.expiresAt) {
      otpStore.delete(transactionId);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    // Check attempts
    if (session.attempts >= 3) {
      otpStore.delete(transactionId);
      return res.status(400).json({
        success: false,
        message: "Maximum OTP attempts exceeded. Please request a new OTP.",
      });
    }

    // Verify OTP
    if (session.otp !== otp) {
      session.attempts++;
      otpStore.set(transactionId, session);

      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${3 - session.attempts} attempts remaining.`,
      });
    }

    // Mark as verified
    session.verified = true;
    otpStore.set(transactionId, session);

    // Get mock KYC data
    const kycData = getMockKycData(aadhaarNumber);

    // Clean up session after 30 minutes
    setTimeout(
      () => {
        otpStore.delete(transactionId);
      },
      30 * 60 * 1000,
    );

    return res.status(200).json({
      success: true,
      verified: true,
      status: "success",
      message: "OTP verified successfully",
      transactionId: transactionId,
      kycData: kycData,
      data: kycData,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP. Please try again.",
    });
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
};
