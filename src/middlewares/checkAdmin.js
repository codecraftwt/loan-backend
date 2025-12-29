const User = require("../models/User");

const checkAdmin = async (req, res, next) => {
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

    // Check if user is an admin (roleId: 0)
    if (user.roleId !== 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admins can perform this action.",
        code: "FORBIDDEN",
      });
    }

    // Attach user info to request for use in controllers
    req.admin = user;
    next();
  } catch (error) {
    console.error("Error in checkAdmin middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying admin access",
      error: error.message,
    });
  }
};

module.exports = checkAdmin;



