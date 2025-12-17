const User = require("../models/User");

const checkLender = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find user and check role
    const user = await User.findById(userId).select("roleId");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is a lender (roleId: 1)
    if (user.roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only lenders can perform this action.",
        code: "FORBIDDEN",
      });
    }

    // Attach user info to request for use in controllers
    req.lender = user;
    next();
  } catch (error) {
    console.error("Error in checkLender middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying lender access",
      error: error.message,
    });
  }
};

module.exports = checkLender;

