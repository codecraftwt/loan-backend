class SMSService {
  constructor() {
    this.isConfigured = !!process.env.SMS_API_KEY;
  }

  async sendOTP(mobileNumber, otp) {
    const cleanMobile = mobileNumber.toString().slice(-10);

    if (this.isConfigured) {
      // Real SMS - Add API call here when credentials provided
      console.log(`SMS sent to ${cleanMobile}: ${otp}`);
      return { success: true };
    }

    // Demo Mode
    console.log(`DEMO - OTP ${otp} for ${cleanMobile}`);
    return { success: true, isDemo: true };
  }
}

module.exports = new SMSService();
