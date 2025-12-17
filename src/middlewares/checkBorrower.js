const User = require("../models/User");

const checkBorrower = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find user and check role
    const user = await User.findById(userId).select("roleId aadharCardNo");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is a borrower (roleId: 2)
    if (user.roleId !== 2) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only borrowers can perform this action.",
        code: "FORBIDDEN",
      });
    }

    // Attach user info to request for use in controllers
    req.borrower = user;
    next();
  } catch (error) {
    console.error("Error in checkBorrower middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying borrower access",
      error: error.message,
    });
  }
};

module.exports = checkBorrower;

