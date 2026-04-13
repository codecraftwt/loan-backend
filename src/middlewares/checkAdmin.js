const User = require("../models/User");

const checkAdmin = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // DEBUG
    console.log("=== CHECKADMIN DEBUG ===");
    console.log("req.user:", req.user);
    console.log("isImpersonating:", req.user.isImpersonating);
    console.log("adminId:", req.user.adminId);
    console.log("=======================");

    if (req.user.isImpersonating && req.user.adminId) {
      const actualAdmin = await User.findById(req.user.adminId).select("roleId");
      console.log("actualAdmin found:", actualAdmin);

      if (actualAdmin && actualAdmin.roleId === 0) {
        req.admin = actualAdmin;
        return next();
      }
    }

    const user = await User.findById(userId).select("roleId");
    console.log("Normal user check:", user);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.roleId !== 0) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admins can perform this action.",
        code: "FORBIDDEN",
      });
    }

    req.admin = user;
    next();
  } catch (error) {
    console.error("Error in checkAdmin:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying admin access",
      error: error.message,
    });
  }
};

module.exports = checkAdmin;