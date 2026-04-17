const User = require("../models/User");

const checkAdminOrLender = async (req, res, next) => {
  try {
    console.log("=== CHECKADMINORLENDER DEBUG ===");
    console.log("req.user:", req.user);

    // Impersonation case (Admin acting as Lender)
    if (req.user?.isImpersonating === true && req.user?.adminId) {
      const actualAdmin = await User.findById(req.user.adminId).select("roleId");
      if (actualAdmin && actualAdmin.roleId === 0) {
        console.log(" Impersonation verified - Allowing access");
        req.isImpersonating = true;
        req.adminId = req.user.adminId;
        return next();
      }
    }

    // Normal case - Admin or Lender
    const user = await User.findById(req.user?.id).select("roleId userName");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.roleId !== 0 && user.roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only admins and lenders can perform this action.",
        code: "FORBIDDEN",
      });
    }

    console.log(` Access granted for roleId: ${user.roleId}`);

    if (user.roleId === 0) req.admin = user;
    if (user.roleId === 1) req.lender = user;

    next();
  } catch (error) {
    console.error("Error in checkAdminOrLender middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying access",
      error: error.message,
    });
  }
};

module.exports = checkAdminOrLender;