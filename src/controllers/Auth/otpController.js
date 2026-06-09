const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const smsService = require("../../services/smsService");
const User = require("../../models/User");

const otpStore = new Map();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateTransactionId = () => crypto.randomBytes(16).toString('hex');

const sendPinResetOtp = async (req, res) => {
  
  try {
    const { mobileNumber } = req.body;
    console.log('Received mobile:', mobileNumber);
    
    if (!mobileNumber) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const cleanMobile = mobileNumber.toString().slice(-10);

    // Search with multiple formats
    const user = await User.findOne({
      $or: [
        { mobileNo: cleanMobile },
        { mobileNo: `+91${cleanMobile}` },
        { mobileNo: `91${cleanMobile}` },
        { mobileNo: { $regex: `${cleanMobile}$` } }  // Ends with the 10 digits
      ]
    });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this mobile number' });
    }

    const otp = generateOTP();
    const transactionId = generateTransactionId();

    otpStore.set(transactionId, {
      mobileNumber: cleanMobile,
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0
    });

    await smsService.sendOTP(cleanMobile, otp);

    res.json({
      success: true,
      transactionId,
      ...(process.env.NODE_ENV !== 'production' && { testOtp: otp })
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

const verifyPinResetOtp = async (req, res) => {
  try {
    const { mobileNumber, otp, transactionId } = req.body;
    const cleanMobile = mobileNumber.toString().slice(-10);
    
    const session = otpStore.get(transactionId);
    
    if (!session) {
      return res.status(400).json({ success: false, message: 'Invalid or expired session' });
    }
    
    if (session.mobileNumber !== cleanMobile) {
      return res.status(400).json({ success: false, message: 'Invalid OTP for this number' });
    }
    
    if (session.attempts >= 3) {
      otpStore.delete(transactionId);
      return res.status(400).json({ success: false, message: 'Too many attempts. Request new OTP' });
    }
    
    if (session.otp !== otp) {
      session.attempts++;
      otpStore.set(transactionId, session);
      return res.status(400).json({ success: false, message: `Invalid OTP. ${3 - session.attempts} attempts left` });
    }
    
    session.verified = true;
    otpStore.set(transactionId, session);
    
    res.json({ success: true, message: 'OTP verified successfully' });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

const resetPin = async (req, res) => {
  try {
    const { mobileNumber, newPin, transactionId } = req.body;
   
    const cleanMobile = mobileNumber.toString().slice(-10);
    
    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'Transaction ID is required' });
    }
    
    if (!newPin || newPin.length !== 4) {
      return res.status(400).json({ success: false, message: 'PIN must be 4 digits' });
    }
    
    const session = otpStore.get(transactionId);
    
    if (!session) {
      return res.status(400).json({ success: false, message: 'Invalid or expired session' });
    }
    
    if (!session.verified) {
      return res.status(400).json({ success: false, message: 'OTP not verified. Please verify OTP first.' });
    }
    
    if (Date.now() > session.expiresAt) {
      otpStore.delete(transactionId);
      return res.status(400).json({ success: false, message: 'Session expired. Request new OTP.' });
    }
    
    // Validate PIN security
    const isSequential = '1234,2345,3456,4567,5678,6789'.includes(newPin);
    if (isSequential) {
      return res.status(400).json({ success: false, message: 'Please choose a more secure PIN (avoid sequential numbers)' });
    }
    
    const isRepeated = /^(\d)\1{3}$/.test(newPin);
    if (isRepeated) {
      return res.status(400).json({ success: false, message: 'Please choose a more secure PIN (avoid repeated digits)' });
    }
    
    const hashedPin = await bcrypt.hash(newPin, 10);
    
    const user = await User.findOneAndUpdate(
      { 
        $or: [
          { mobileNo: cleanMobile },
          { mobileNo: `+91${cleanMobile}` },
          { mobileNo: `91${cleanMobile}` }
        ]
      },
      { pinHash: hashedPin, pinAttempts: 0, pinLockedUntil: null },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    otpStore.delete(transactionId);
    
    res.json({ success: true, message: 'PIN reset successfully' });
    
  } catch (error) {
    console.error('Reset PIN error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset PIN: ' + error.message });
  }
};

module.exports = { sendPinResetOtp, verifyPinResetOtp, resetPin };