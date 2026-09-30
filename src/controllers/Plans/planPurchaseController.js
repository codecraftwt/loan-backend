const Plan = require("../../models/Plan");
const User = require("../../models/User");
const SubscriptionHistory = require("../../models/SubscriptionHistory");
const razorpayInstance = require("../../config/razorpay.config");
const crypto = require("crypto");

// Create Razorpay order for plan purchase / recharge
const createPlanOrder = async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    if (!planId) {
      return res.status(400).json({
        success: false,
        message: "planId is required",
      });
    }

    // Check if user is a lender
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: "Only lenders can purchase subscription plans",
      });
    }

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    if (!plan.isActive || plan.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "This plan is not currently active",
      });
    }

    // Calculate pack price in paise
    const packPrice = plan.price || plan.priceMonthly || 1999;
    const amountInPaise = Math.round(packPrice * 100);

    // Create Razorpay order
    const timestamp = Date.now();
    const shortPlanId = planId.toString().substring(18, 24);
    const shortUserId = userId.toString().substring(18, 24);
    const receiptId = `plan_${shortPlanId}_${shortUserId}_${timestamp.toString().slice(-6)}`;

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: receiptId,
      notes: {
        userId: userId.toString(),
        planId: planId.toString(),
        planName: plan.planName,
        duration: plan.duration,
        durationDays: String(plan.durationDays || 30),
        userEmail: user.email,
        userName: user.userName,
      },
    };

    const order = await razorpayInstance.orders.create(options);

    // Check if lender already has an active plan (for renewal/extension notice)
    const now = new Date();
    const hasActivePlan = user.currentPlanId && user.planExpiryDate && new Date(user.planExpiryDate) > now;
    const currentExpiry = hasActivePlan ? user.planExpiryDate : null;

    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        isExtension: hasActivePlan,
        currentExpiryDate: currentExpiry,
        plan: {
          id: plan._id,
          planName: plan.planName,
          description: plan.description,
          duration: plan.duration,
          durationDays: plan.durationDays || 30,
          price: packPrice,
          priceMonthly: plan.priceMonthly || Math.round(packPrice / ((plan.durationDays || 30) / 30)),
          tag: plan.tag,
          allServicesIncluded: plan.allServicesIncluded ?? true,
          servicesList: plan.servicesList,
          planFeatures: plan.planFeatures,
        },
      },
    });
  } catch (error) {
    console.error("Error creating plan order:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Verify payment and activate / extend plan
const verifyPaymentAndActivatePlan = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      planId,
    } = req.body;

    const userId = req.user.id;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !planId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: razorpay_payment_id, razorpay_order_id, razorpay_signature, planId",
      });
    }

    // Verify Razorpay signature
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || 'tU0NirIbZRB7qDM2r50EgcCG';
    const signatureString = razorpay_order_id + "|" + razorpay_payment_id;
    
    const expectedSignature = crypto
      .createHmac("sha256", razorpaySecret)
      .update(signatureString)
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    if (!isAuthentic) {
      console.error("Payment signature verification failed:");
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Invalid signature.",
      });
    }

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.roleId !== 1) {
      return res.status(403).json({
        success: false,
        message: "Only lenders can activate subscription plans",
      });
    }

    // Calculate expiry date: If user has an active plan, extend from existing expiry date!
    const now = new Date();
    let baseDate = now;
    let isExtended = false;

    if (user.planExpiryDate && new Date(user.planExpiryDate) > now) {
      baseDate = new Date(user.planExpiryDate);
      isExtended = true;
    }

    // Determine days to add
    let daysToAdd = plan.durationDays;
    if (!daysToAdd) {
      if (plan.duration === "1 month") daysToAdd = 30;
      else if (plan.duration === "2 months") daysToAdd = 60;
      else if (plan.duration === "3 months") daysToAdd = 90;
      else if (plan.duration === "6 months") daysToAdd = 180;
      else if (plan.duration === "1 year") daysToAdd = 365;
      else daysToAdd = 30;
    }

    const newExpiryDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    // Update user with plan details
    user.currentPlanId = plan._id;
    user.planPurchaseDate = now;
    user.planExpiryDate = newExpiryDate;
    user.razorpayOrderId = razorpay_order_id;
    user.razorpayPaymentId = razorpay_payment_id;
    user.razorpaySignature = razorpay_signature;

    await user.save();

    // Log in SubscriptionHistory
    try {
      await SubscriptionHistory.create({
        userId: user._id,
        planId: plan._id,
        planName: plan.planName,
        duration: plan.duration,
        durationDays: daysToAdd,
        price: plan.price || plan.priceMonthly || 1999,
        priceMonthly: plan.priceMonthly,
        tag: plan.tag || "",
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        purchaseDate: now,
        startDate: baseDate,
        expiryDate: newExpiryDate,
        paymentStatus: "completed",
        isExtension: isExtended,
      });
    } catch (historyErr) {
      console.error("Error creating subscription history record:", historyErr);
    }

    const remainingDays = Math.max(0, Math.ceil((newExpiryDate - now) / (1000 * 60 * 60 * 24)));

    return res.status(200).json({
      success: true,
      message: isExtended
        ? `Recharge successful! Your subscription has been extended by ${daysToAdd} days.`
        : `Subscription activated successfully for ${daysToAdd} days.`,
      data: {
        plan: {
          id: plan._id,
          planName: plan.planName,
          description: plan.description,
          duration: plan.duration,
          durationDays: daysToAdd,
          price: plan.price || plan.priceMonthly,
          priceMonthly: plan.priceMonthly,
          tag: plan.tag,
          allServicesIncluded: plan.allServicesIncluded ?? true,
          servicesList: plan.servicesList,
        },
        purchaseDate: now,
        expiryDate: newExpiryDate,
        remainingDays,
        isActive: true,
        isExtended,
      },
    });
  } catch (error) {
    console.error("Error verifying payment and activating plan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while activating plan",
      error: error.message,
    });
  }
};

// Get user's active plan
const getActivePlan = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .select("currentPlanId planPurchaseDate planExpiryDate")
      .populate("currentPlanId");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const now = new Date();
    const hasActivePlan = user.currentPlanId && 
                          user.planExpiryDate && 
                          new Date(user.planExpiryDate) > now;

    if (!hasActivePlan) {
      return res.status(200).json({
        success: true,
        message: "No active plan found",
        data: {
          hasActivePlan: false,
          plan: null,
          purchaseDate: null,
          expiryDate: null,
          remainingDays: 0,
          isActive: false,
        },
      });
    }

    const expiryDate = new Date(user.planExpiryDate);
    const remainingDays = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));

    const p = user.currentPlanId;

    return res.status(200).json({
      success: true,
      message: "Active plan retrieved successfully",
      data: {
        hasActivePlan: true,
        plan: p ? {
          id: p._id,
          planName: p.planName,
          description: p.description,
          duration: p.duration,
          durationDays: p.durationDays || (p.duration === "1 year" ? 365 : p.duration === "6 months" ? 180 : p.duration === "3 months" ? 90 : 30),
          price: p.price || p.priceMonthly || 1999,
          priceMonthly: p.priceMonthly || p.price || 1999,
          tag: p.tag,
          allServicesIncluded: p.allServicesIncluded ?? true,
          servicesList: p.servicesList,
          planFeatures: p.planFeatures,
        } : null,
        purchaseDate: user.planPurchaseDate,
        expiryDate: user.planExpiryDate,
        remainingDays,
        isActive: true,
      },
    });
  } catch (error) {
    console.error("Error fetching active plan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching active plan",
      error: error.message,
    });
  }
};

// Get user's subscription / recharge history
const getSubscriptionHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const history = await SubscriptionHistory.find({ userId })
      .populate("planId", "planName duration durationDays price tag")
      .sort({ purchaseDate: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Subscription history fetched successfully",
      count: history.length,
      data: history,
    });
  } catch (error) {
    console.error("Error fetching subscription history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching subscription history",
      error: error.message,
    });
  }
};

module.exports = {
  createPlanOrder,
  verifyPaymentAndActivatePlan,
  getActivePlan,
  getSubscriptionHistory,
};
