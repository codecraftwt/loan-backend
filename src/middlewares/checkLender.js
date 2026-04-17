const User = require("../models/User");

const checkLender = async (req, res, next) => {
  try {
    console.log("=== CHECKLENDER DEBUG START ===");
    console.log("Full req.user:", req.user);
    console.log("isImpersonating:", req.user?.isImpersonating);
    console.log("adminId from token:", req.user?.adminId);
    console.log("Current user ID:", req.user?.id);

    // Impersonation case
    if (req.user?.isImpersonating === true && req.user?.adminId) {
      console.log("→ Impersonation detected! Checking actual admin...");

      const actualAdmin = await User.findById(req.user.adminId).select("roleId userName");
      console.log("Actual Admin found:", actualAdmin);

      if (actualAdmin && actualAdmin.roleId === 0) {
        console.log(" Impersonation verified - Allowing access as Lender");
        req.isImpersonating = true;
        req.adminId = req.user.adminId;
        console.log("=== CHECKLENDER DEBUG END (Allowed) ===");
        return next();
      } else {
        console.log(" Impersonation failed - Admin not valid");
      }
    }

    // Normal lender case
    console.log("→ Checking as normal lender...");
    const user = await User.findById(req.user.id).select("roleId userName");
    console.log("Normal user lookup:", user);

    if (!user) {
      console.log(" User not found");
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.roleId !== 1) {
      console.log(" Not a lender (roleId:", user.roleId, ")");
      return res.status(403).json({
        success: false,
        message: "Access denied. Only lenders can perform this action.",
        code: "FORBIDDEN",
      });
    }

    console.log(" Normal lender access granted");
    console.log("=== CHECKLENDER DEBUG END (Allowed) ===");

    req.lender = user;
    req.isImpersonating = false;
    next();
  } catch (error) {
    console.error(" Error in checkLender middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying lender access",
      error: error.message,
    });
  }
};

module.exports = checkLender;