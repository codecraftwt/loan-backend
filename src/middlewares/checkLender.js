const User = require("../models/User");

const checkLender = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Impersonation case — allow kar do
    if (req.user.isImpersonating && req.user.adminId) {
      const actualAdmin = await User.findById(req.user.adminId).select("roleId");
      if (actualAdmin && actualAdmin.roleId === 0) {
        req.isImpersonating = true;
        req.adminId = req.user.adminId;
        return next();
      }
    }

    // Normal Lender check
    const user = await User.findById(userId).select("roleId");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only lenders can perform this action.",
        code: "FORBIDDEN",
      });
    }

    req.lender = user;
    req.isImpersonating = req.user.isImpersonating || false;
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