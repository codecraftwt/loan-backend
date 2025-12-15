const Subscription = require('../models/Subscription');
const User = require('../models/User');

const checkSubscription = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user with subscription info
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        message: 'User not found'
      });
    }

    // Check if user has active subscription
    const activeSubscription = await Subscription.findOne({
      user: userId,
      status: 'active',
      currentPeriodEnd: { $gt: new Date() }
    });

    if (!activeSubscription) {
      return res.status(403).json({
        message: 'Active subscription required to perform this action',
        code: 'SUBSCRIPTION_REQUIRED',
        redirectTo: '/subscription/plans'
      });
    }

    // Check loan limit
    const loanCount = await req.app.locals.loanCount; // You'll need to set this in your route

    if (loanCount >= activeSubscription.features.maxLoans) {
      return res.status(403).json({
        message: `Loan limit reached. Your plan allows maximum ${activeSubscription.features.maxLoans} loans`,
        code: 'LOAN_LIMIT_EXCEEDED'
      });
    }

    // Attach subscription info to request
    req.subscription = activeSubscription;
    next();
  } catch (error) {
    console.error('Error checking subscription:', error);
    return res.status(500).json({
      message: 'Error checking subscription status',
      error: error.message
    });
  }
};

// Middleware to check specific feature
const checkFeature = (feature) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      const activeSubscription = await Subscription.findOne({
        user: userId,
        status: 'active',
        currentPeriodEnd: { $gt: new Date() }
      });

      if (!activeSubscription) {
        return res.status(403).json({
          message: 'Active subscription required'
        });
      }

      if (!activeSubscription.features[feature]) {
        return res.status(403).json({
          message: `This feature is not available in your current plan`
        });
      }

      next();
    } catch (error) {
      console.error('Error checking feature:', error);
      return res.status(500).json({
        message: 'Error checking feature availability',
        error: error.message
      });
    }
  };
};

module.exports = {
  checkSubscription,
  checkFeature
};