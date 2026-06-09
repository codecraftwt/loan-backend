const bcrypt = require("bcryptjs");
const User = require("../../models/User");

// Verify PIN for loan acceptance
const verifyPin = async (req, res) => {
  try {
    const { userId, pin } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.pinHash) {
      return res.status(400).json({ success: false, message: "PIN not set" });
    }

    // Check lock
    if (user.pinLockedUntil && new Date() < user.pinLockedUntil) {
      return res.status(403).json({ success: false, message: "PIN locked" });
    }

    const isValid = await bcrypt.compare(pin, user.pinHash);

    if (!isValid) {
      const attempts = (user.pinAttempts || 0) + 1;
      const lockUntil =
        attempts >= 5 ? new Date(Date.now() + 30 * 60000) : null;

      await User.findByIdAndUpdate(userId, {
        pinAttempts: attempts,
        pinLockedUntil: lockUntil,
      });

      return res.status(401).json({
        success: false,
        message: `Invalid PIN. ${5 - attempts} attempts left`,
      });
    }

    // Reset attempts on success
    await User.findByIdAndUpdate(userId, {
      pinAttempts: 0,
      pinLockedUntil: null,
    });

    res.json({ success: true, message: "PIN verified" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Verification failed" });
  }
};

module.exports = { verifyPin };
