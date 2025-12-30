const User = require("../models/User");

const checkActivePlan = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Find user and check plan
    const user = await User.findById(userId)
      .select("currentPlanId planExpiryDate roleId");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user is a lender
    if (user.roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only lenders can perform this action.",
        code: "FORBIDDEN",
      });
    }

    // Check if user has an active plan
    const now = new Date();
    const hasActivePlan = user.currentPlanId && 
                          user.planExpiryDate && 
                          new Date(user.planExpiryDate) > now;

    if (!hasActivePlan) {
      return res.status(403).json({
        success: false,
        message: "Active plan required to create loans. Please purchase a plan first.",
        code: "PLAN_REQUIRED",
      });
    }

    // Attach plan info to request for use in controllers
    req.userPlan = {
      planId: user.currentPlanId,
      expiryDate: user.planExpiryDate,
    };

    next();
  } catch (error) {
    console.error("Error in checkActivePlan middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while verifying plan access",
      error: error.message,
    });
  }
};

module.exports = checkActivePlan;

