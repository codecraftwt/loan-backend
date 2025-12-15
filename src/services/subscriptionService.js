const User = require("../models/User");
const Loan = require("../models/Loan");
const Subscription = require("../models/Subscription");

const checkUserSubscription = async (userId) => {
  try {
    const user = await User.findById(userId)
      .populate('subscriptionId');

    if (!user) {
      return {
        hasActiveSubscription: false,
        message: "User not found"
      };
    }

    // Check if user has active subscription
    const now = new Date();
    const endDate = new Date(user.endDate);
    const hasActiveSubscription = user.isActive &&
      user.paymentStatus === 'captured' &&
      user.status === 'active' &&
      endDate > now &&
      user.subscriptionId;

    return {
      hasActiveSubscription: hasActiveSubscription,
      subscription: hasActiveSubscription ? {
        subscriptionId: user.subscriptionId,
        startDate: user.startDate,
        endDate: user.endDate,
        ...user.subscriptionId._doc
      } : null,
      userData: user
    };
  } catch (error) {
    console.error("Error checking subscription:", error);
    return {
      hasActiveSubscription: false,
      error: error.message
    };
  }
};

const canUserCreateLoan = async (userId) => {
  try {
    const { hasActiveSubscription, subscription, userData } = await checkUserSubscription(userId);

    if (!hasActiveSubscription) {
      return {
        canCreate: false,
        message: "You need an active subscription to create loans. Please subscribe first."
      };
    }

    // Check loan limits if subscription has limits
    if (subscription && subscription.maxLoans > 0) {
      const loanCount = await Loan.countDocuments({
        lenderId: userId,
        createdAt: { $gte: userData.startDate }
      });

      if (loanCount >= subscription.maxLoans) {
        return {
          canCreate: false,
          message: `You have reached the maximum loan limit (${subscription.maxLoans}) for your current plan. Please upgrade your subscription.`
        };
      }
    }

    return {
      canCreate: true,
      subscription: subscription
    };
  } catch (error) {
    console.error("Error checking loan creation permission:", error);
    return {
      canCreate: false,
      message: "Error checking subscription status"
    };
  }
};

// Check if user has active subscription (simplified version)
const hasActiveSubscription = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return false;
    }

    const now = new Date();
    const endDate = new Date(user.endDate);

    return user.isActive &&
      user.paymentStatus === 'captured' &&
      user.status === 'active' &&
      endDate > now &&
      user.subscriptionId;
  } catch (error) {
    console.error("Error checking active subscription:", error);
    return false;
  }
};

// Get subscription details for user
const getUserSubscriptionDetails = async (userId) => {
  try {
    const user = await User.findById(userId)
      .select('subscriptionId startDate endDate status isActive paymentStatus amount')
      .populate('subscriptionId', 'name description amount duration maxLoans features');

    if (!user) {
      return null;
    }

    const now = new Date();
    const endDate = new Date(user.endDate);
    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));

    return {
      subscription: user.subscriptionId,
      startDate: user.startDate,
      endDate: user.endDate,
      status: user.status,
      isActive: user.isActive,
      paymentStatus: user.paymentStatus,
      amount: user.amount,
      daysRemaining: daysRemaining,
      isValid: user.isActive &&
        user.paymentStatus === 'captured' &&
        user.status === 'active' &&
        endDate > now
    };
  } catch (error) {
    console.error("Error getting subscription details:", error);
    return null;
  }
};

// Update user subscription
const updateUserSubscription = async (userId, subscriptionData) => {
  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: subscriptionData
      },
      { new: true }
    ).select('-password');

    return user;
  } catch (error) {
    console.error("Error updating user subscription:", error);
    throw error;
  }
};

// Count loans created during subscription period
const countUserLoansInSubscription = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user || !user.startDate) {
      return 0;
    }

    const loanCount = await Loan.countDocuments({
      lenderId: userId,
      createdAt: { $gte: user.startDate }
    });

    return loanCount;
  } catch (error) {
    console.error("Error counting user loans:", error);
    return 0;
  }
};

// Check if user can create more loans
const canCreateMoreLoans = async (userId) => {
  try {
    const subscriptionDetails = await getUserSubscriptionDetails(userId);

    if (!subscriptionDetails || !subscriptionDetails.isValid) {
      return {
        canCreate: false,
        message: "No active subscription found"
      };
    }

    // If maxLoans is 0, unlimited loans allowed
    if (subscriptionDetails.subscription.maxLoans === 0) {
      return {
        canCreate: true,
        remainingLoans: 'unlimited',
        message: "Unlimited loans available"
      };
    }

    const loansCreated = await countUserLoansInSubscription(userId);
    const remainingLoans = Math.max(0, subscriptionDetails.subscription.maxLoans - loansCreated);

    return {
      canCreate: remainingLoans > 0,
      remainingLoans: remainingLoans,
      totalAllowed: subscriptionDetails.subscription.maxLoans,
      usedLoans: loansCreated,
      message: remainingLoans > 0
        ? `You can create ${remainingLoans} more loan(s)`
        : `You have reached your limit of ${subscriptionDetails.subscription.maxLoans} loans`
    };
  } catch (error) {
    console.error("Error checking loan creation ability:", error);
    return {
      canCreate: false,
      message: "Error checking subscription limits"
    };
  }
};

module.exports = {
  checkUserSubscription,
  canUserCreateLoan,
  hasActiveSubscription,
  getUserSubscriptionDetails,
  updateUserSubscription,
  countUserLoansInSubscription,
  canCreateMoreLoans
};