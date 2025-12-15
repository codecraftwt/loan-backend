const Subscription = require('../models/Subscription');
const User = require('../models/User');

const checkSubscription = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Check user's subscription status
    const user = await User.findById(userId).select('hasActiveSubscription subscriptionPlan subscriptionExpiry subscriptionStatus');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if user has active subscription
    if (!user.hasActiveSubscription || user.subscriptionStatus !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required to create loans',
        code: 'SUBSCRIPTION_REQUIRED',
        redirectTo: '/subscription/plans'
      });
    }
    
    // Check if subscription is expired
    if (user.subscriptionExpiry && new Date() > user.subscriptionExpiry) {
      // Update user subscription status
      await User.findByIdAndUpdate(userId, {
        hasActiveSubscription: false,
        subscriptionStatus: 'expired'
      });
      
      return res.status(403).json({
        success: false,
        message: 'Your subscription has expired. Please renew your subscription.',
        code: 'SUBSCRIPTION_EXPIRED'
      });
    }
    
    // Check loan limit based on plan
    const subscription = await Subscription.findOne({
      user: userId,
      status: 'active'
    });
    
    if (subscription) {
      const loanCount = await req.app.locals.loanCount || 0;
      
      if (loanCount >= subscription.features.maxLoans) {
        return res.status(403).json({
          success: false,
          message: `You have reached your loan limit. Your ${user.subscriptionPlan} plan allows maximum ${subscription.features.maxLoans} loans.`,
          code: 'LOAN_LIMIT_EXCEEDED'
        });
      }
      
      // Check loan amount limit
      if (req.body.amount && subscription.features.maxLoanAmount) {
        if (req.body.amount > subscription.features.maxLoanAmount) {
          return res.status(403).json({
            success: false,
            message: `Loan amount exceeds your plan limit of ₹${subscription.features.maxLoanAmount}`,
            code: 'LOAN_AMOUNT_EXCEEDED'
          });
        }
      }
      
      // Attach subscription info to request
      req.subscription = subscription;
    }
    
    req.userSubscription = user;
    next();
  } catch (error) {
    console.error('Error checking subscription:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking subscription status',
      error: error.message
    });
  }
};

module.exports = checkSubscription;