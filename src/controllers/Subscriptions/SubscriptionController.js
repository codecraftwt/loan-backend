const Subscription = require("../../models/Subscription");
const User = require("../../models/User");
const razorpayInstance = require("../../config/razorpay.config");
const crypto = require("crypto");

// Create new subscription plan (Admin function)
const createSubscriptionPlan = async (req, res) => {
  try {
    const { name, description, amount, duration, durationInMonths, features, maxLoans } = req.body;

    // Validate required fields
    if (!name || !description || !amount || !duration || !durationInMonths) {
      return res.status(400).json({
        message: "Missing required fields: name, description, amount, duration, durationInMonths"
      });
    }

    // Validate duration
    const validDurations = ['monthly', 'yearly', 'quarterly', 'custom'];
    if (!validDurations.includes(duration)) {
      return res.status(400).json({
        message: "Invalid duration. Must be one of: monthly, yearly, quarterly, custom"
      });
    }

    // Create subscription in database
    const subscription = new Subscription({
      name,
      description,
      amount,
      duration,
      durationInMonths,
      features: features || [],
      maxLoans: maxLoans || 0,
      isActive: true
    });

    // For recurring subscriptions, create Razorpay plan
    if (duration === 'monthly' || duration === 'yearly') {
      try {
        const period = duration === 'monthly' ? 'monthly' : 'yearly';

        const razorpayPlan = await razorpayInstance.plans.create({
          period: period,
          interval: 1,
          item: {
            name: name,
            description: description,
            amount: amount * 100, // Convert to paise
            currency: 'INR'
          },
          notes: {
            maxLoans: (maxLoans || 0).toString()
          }
        });

        subscription.razorpayPlanId = razorpayPlan.id;
      } catch (razorpayError) {
        console.error("Razorpay plan creation failed:", razorpayError);
        // Continue without Razorpay plan ID for one-time payments
      }
    }

    await subscription.save();

    return res.status(201).json({
      message: "Subscription plan created successfully",
      data: subscription
    });
  } catch (error) {
    console.error("Error creating subscription plan:", error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Get all active subscription plans
const getAllSubscriptionPlans = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ isActive: true })
      .sort({ amount: 1 })
      .select('-razorpayPlanId');

    return res.status(200).json({
      message: "Subscription plans fetched successfully",
      data: subscriptions
    });
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Get subscription plan by ID
const getSubscriptionPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    const subscription = await Subscription.findById(id)
      .select('-razorpayPlanId');

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription plan not found"
      });
    }

    return res.status(200).json({
      message: "Subscription plan fetched successfully",
      data: subscription
    });
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Update subscription plan
const updateSubscriptionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const subscription = await Subscription.findById(id);

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription plan not found"
      });
    }

    // Update fields
    const allowedUpdates = ['name', 'description', 'amount', 'duration', 'durationInMonths', 'features', 'maxLoans', 'isActive'];
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        subscription[key] = updates[key];
      }
    });

    await subscription.save();

    return res.status(200).json({
      message: "Subscription plan updated successfully",
      data: subscription
    });
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Create Razorpay order for subscription purchase
const createSubscriptionOrder = async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    const userId = req.user.id;

    if (!subscriptionId) {
      return res.status(400).json({
        message: "subscriptionId is required"
      });
    }

    // Get subscription details
    const subscription = await Subscription.findById(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription plan not found"
      });
    }

    if (!subscription.isActive) {
      return res.status(400).json({
        message: "This subscription plan is not active"
      });
    }

    // Get user details
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Create Razorpay order
    const timestamp = Date.now();
    const shortSubscriptionId = subscriptionId.toString().substring(18, 24); // Last 6 chars
    const shortUserId = userId.toString().substring(18, 24); // Last 6 chars

    const receiptId = `sub_${shortSubscriptionId}_${shortUserId}_${timestamp.toString().slice(-6)}`;
    // Result: "sub_cae1_c4d_540000" (well under 40 chars)

    // Create Razorpay order
    const options = {
      amount: subscription.amount * 100, // Convert to paise
      currency: "INR",
      receipt: receiptId, // FIXED: Shorter receipt
      notes: {
        userId: userId.toString(),
        subscriptionId: subscriptionId.toString(),
        subscriptionName: subscription.name,
        userEmail: user.email,
        userName: user.userName
      }
    };

    const order = await razorpayInstance.orders.create(options);

    return res.status(200).json({
      message: "Order created successfully",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        subscription: {
          id: subscription._id,
          name: subscription.name,
          description: subscription.description,
          amount: subscription.amount,
          duration: subscription.duration,
          durationInMonths: subscription.durationInMonths,
          maxLoans: subscription.maxLoans
        },
        user: {
          id: user._id,
          name: user.userName,
          email: user.email
        }
      }
    });
  } catch (error) {
    console.error("Error creating order:", error);

    if (error.error && error.error.description) {
      return res.status(400).json({
        message: "Payment gateway error",
        error: error.error.description
      });
    }

    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Verify payment and activate subscription
const verifyPaymentAndActivateSubscription = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      subscriptionId
    } = req.body;

    const userId = req.user.id;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !subscriptionId) {
      return res.status(400).json({
        message: "Missing required fields: razorpay_payment_id, razorpay_order_id, razorpay_signature, subscriptionId"
      });
    }

    // Verify payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'IOULEZFaWRNrL92MNqF5eDr0')
      .update(body.toString())
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      return res.status(400).json({
        message: "Invalid payment signature"
      });
    }

    // Get subscription details
    const subscription = await Subscription.findById(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription plan not found"
      });
    }

    // Calculate end date based on duration
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + subscription.durationInMonths);

    // Update user with subscription details
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        subscriptionId: subscription._id,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
        amount: subscription.amount,
        status: 'active',
        paymentStatus: 'captured',
        startDate: startDate,
        endDate: endDate,
        isActive: true
      },
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    return res.status(200).json({
      message: "Subscription activated successfully",
      data: {
        subscription: {
          id: subscription._id,
          name: subscription.name,
          amount: subscription.amount,
          duration: subscription.duration,
          endDate: endDate
        },
        user: {
          id: updatedUser._id,
          userName: updatedUser.userName,
          email: updatedUser.email,
          subscriptionEndDate: updatedUser.endDate,
          isActive: updatedUser.isActive
        }
      }
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Get user's active subscription
const getUserActiveSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select('-password')
      .populate('subscriptionId', 'name description amount duration maxLoans features');

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Check if subscription is active
    const now = new Date();
    const endDate = new Date(user.endDate);
    const hasActiveSubscription = user.isActive &&
      user.paymentStatus === 'captured' &&
      user.status === 'active' &&
      endDate > now;

    if (!hasActiveSubscription) {
      return res.status(200).json({
        message: "No active subscription found",
        hasActiveSubscription: false,
        data: null
      });
    }

    return res.status(200).json({
      message: "Active subscription found",
      hasActiveSubscription: true,
      data: {
        subscription: user.subscriptionId,
        startDate: user.startDate,
        endDate: user.endDate,
        paymentStatus: user.paymentStatus,
        status: user.status
      }
    });
  } catch (error) {
    console.error("Error fetching active subscription:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Check if user can create loan
const canUserCreateLoan = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return {
        canCreate: false,
        message: "User not found"
      };
    }

    // Check if user has active subscription
    const now = new Date();
    const endDate = new Date(user.endDate);
    const hasActiveSubscription = user.isActive &&
      user.paymentStatus === 'captured' &&
      user.status === 'active' &&
      endDate > now;

    if (!hasActiveSubscription) {
      return {
        canCreate: false,
        message: "You need an active subscription to create loans. Please subscribe first."
      };
    }

    // Get subscription details
    const subscription = await Subscription.findById(user.subscriptionId);

    if (!subscription) {
      return {
        canCreate: false,
        message: "Subscription plan not found"
      };
    }

    // Check loan limits if subscription has limits
    if (subscription.maxLoans > 0) {
      const loanCount = await Loan.countDocuments({
        lenderId: userId,
        createdAt: { $gte: user.startDate }
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

// Webhook handler for Razorpay events
const handleRazorpayWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookBody = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'IOULEZFaWRNrL92MNqF5eDr0')
      .update(webhookBody)
      .digest('hex');

    if (expectedSignature !== webhookSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`Received Razorpay webhook event: ${event}`);

    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;

      default:
        console.log(`Unhandled event type: ${event}`);
    }

    return res.status(200).json({ message: 'Webhook received successfully' });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.status(500).json({ message: 'Error handling webhook' });
  }
};

// Helper function to handle payment captured
const handlePaymentCaptured = async (payload) => {
  try {
    const { payment, order } = payload;

    // Extract user ID from order notes
    const userId = order.notes?.userId;

    if (!userId) {
      console.error('No userId found in order notes');
      return;
    }

    // Update user subscription status
    await User.findByIdAndUpdate(userId, {
      paymentStatus: 'captured',
      status: 'active',
      isActive: true
    });

    console.log(`Payment captured for user: ${userId}`);
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
};

// Helper function to handle payment failed
const handlePaymentFailed = async (payload) => {
  try {
    const { payment, order } = payload;

    // Extract user ID from order notes
    const userId = order.notes?.userId;

    if (!userId) {
      console.error('No userId found in order notes');
      return;
    }

    // Update user subscription status
    await User.findByIdAndUpdate(userId, {
      paymentStatus: 'failed',
      status: 'cancelled',
      isActive: false
    });

    console.log(`Payment failed for user: ${userId}`);
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
};

// Cancel user subscription
const cancelUserSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Update user subscription status
    user.status = 'cancelled';
    user.isActive = false;
    user.endDate = new Date(); // Set end date to now

    await user.save();

    return res.status(200).json({
      message: "Subscription cancelled successfully",
      data: {
        status: user.status,
        isActive: user.isActive,
        endDate: user.endDate
      }
    });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Get subscription statistics
const getSubscriptionStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('subscriptionId startDate endDate status isActive');

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Calculate days remaining
    const now = new Date();
    const endDate = new Date(user.endDate);
    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));

    // Get subscription details
    const subscription = user.subscriptionId ?
      await Subscription.findById(user.subscriptionId).select('name amount duration maxLoans') :
      null;

    // Count active users with subscriptions
    const activeSubscribersCount = await User.countDocuments({
      isActive: true,
      status: 'active',
      endDate: { $gt: now }
    });

    return res.status(200).json({
      message: "Subscription stats fetched successfully",
      data: {
        userStats: {
          hasSubscription: !!user.subscriptionId,
          status: user.status,
          isActive: user.isActive,
          startDate: user.startDate,
          endDate: user.endDate,
          daysRemaining: daysRemaining
        },
        subscription: subscription,
        platformStats: {
          activeSubscribers: activeSubscribersCount
        }
      }
    });
  } catch (error) {
    console.error("Error fetching subscription stats:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// Test purchase endpoint (no real payment needed)
const testPurchaseSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    const userId = req.user.id;

    // Get subscription details
    const subscription = await Subscription.findById(subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        message: "Subscription plan not found"
      });
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + subscription.durationInMonths);

    // Generate test payment data
    const testPaymentId = `test_pay_${Date.now()}`;
    const testOrderId = `test_order_${Date.now()}`;
    const testSignature = `test_sig_${Date.now()}`;

    // Update user with subscription data
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        subscriptionId: subscription._id,
        razorpayPaymentId: testPaymentId,
        razorpayOrderId: testOrderId,
        razorpaySignature: testSignature,
        amount: subscription.amount,
        status: 'active',
        paymentStatus: 'captured',
        startDate: startDate,
        endDate: endDate,
        isActive: true
      },
      { new: true }
    ).select('-password').populate('subscriptionId');

    return res.status(200).json({
      message: "Test subscription activated successfully",
      data: {
        subscription: updatedUser.subscriptionId,
        user: {
          id: updatedUser._id,
          userName: updatedUser.userName,
          email: updatedUser.email,
          startDate: updatedUser.startDate,
          endDate: updatedUser.endDate,
          isActive: updatedUser.isActive
        }
      }
    });

  } catch (error) {
    console.error("Error in test purchase:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

module.exports = {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  createSubscriptionOrder,
  verifyPaymentAndActivateSubscription,
  getUserActiveSubscription,
  canUserCreateLoan,
  handleRazorpayWebhook,
  cancelUserSubscription,
  getSubscriptionStats,
  testPurchaseSubscription
};