// MOCK Aadhaar eKYC OTP flow — no real UIDAI/provider integration.
// Swap this out for a licensed provider (Surepass, Karza, Digio, etc.) before going live.

const aadhaarOtpStore = {};
const OTP_TTL_MS = 5 * 60 * 1000;
const MOCK_OTP = "123456";

const sendAadhaarOtp = async (req, res) => {
  try {
    const { aadhaarNumber, consentAccepted } = req.body;

    if (!aadhaarNumber || !/^\d{12}$/.test(aadhaarNumber)) {
      return res.status(400).json({ message: "A valid 12-digit Aadhaar number is required" });
    }
    if (!consentAccepted) {
      return res.status(400).json({ message: "Consent is required to proceed with Aadhaar verification" });
    }

    const transactionId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    aadhaarOtpStore[transactionId] = {
      aadhaarNumber,
      otp: MOCK_OTP,
      expiresAt: Date.now() + OTP_TTL_MS,
    };

    return res.status(200).json({
      message: "OTP sent successfully",
      transactionId,
      // Mock mode only — lets the app be testable without a real provider.
      mockOtp: MOCK_OTP,
    });
  } catch (error) {
    console.error("sendAadhaarOtp error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const verifyAadhaarOtp = async (req, res) => {
  try {
    const { aadhaarNumber, otp, transactionId } = req.body;

    if (!transactionId || !otp) {
      return res.status(400).json({ message: "transactionId and OTP are required" });
    }

    const record = aadhaarOtpStore[transactionId];
    if (!record) {
      return res.status(400).json({ message: "Invalid or expired transaction. Please request a new OTP." });
    }
    if (Date.now() > record.expiresAt) {
      delete aadhaarOtpStore[transactionId];
      return res.status(400).json({ message: "OTP expired. Please request a new OTP." });
    }
    if (aadhaarNumber && aadhaarNumber !== record.aadhaarNumber) {
      return res.status(400).json({ message: "Aadhaar number does not match this transaction" });
    }
    if (otp !== record.otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    delete aadhaarOtpStore[transactionId];

    return res.status(200).json({
      message: "Aadhaar verified successfully",
      verified: true,
      aadhaarNumber: record.aadhaarNumber,
    });
  } catch (error) {
    console.error("verifyAadhaarOtp error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { sendAadhaarOtp, verifyAadhaarOtp };
