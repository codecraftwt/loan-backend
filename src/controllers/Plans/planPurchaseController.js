const Plan = require("../../models/Plan");
const User = require("../../models/User");
const razorpayInstance = require("../../config/razorpay.config");
const crypto = require("crypto");

// Create Razorpay order for plan purchase
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
        message: "Only lenders can purchase plans",
      });
    }

    // Check if user already has an active plan
    if (user.currentPlanId && user.planExpiryDate) {
      const now = new Date();
      const expiryDate = new Date(user.planExpiryDate);
      
      if (expiryDate > now) {
        // User has an active plan that hasn't expired yet
        const remainingDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        
        return res.status(400).json({
          success: false,
          message: "You already have an active plan. Please wait until your current plan expires to purchase a new one.",
          data: {
            currentPlanExpiryDate: user.planExpiryDate,
            remainingDays: remainingDays,
            canPurchaseNewPlan: false,
          },
        });
      }
    }

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    if (!plan.isActive) {
      return res.status(400).json({
        success: false,
        message: "This plan is not active",
      });
    }

    // Create Razorpay order
    const timestamp = Date.now();
    const shortPlanId = planId.toString().substring(18, 24);
    const shortUserId = userId.toString().substring(18, 24);
    const receiptId = `plan_${shortPlanId}_${shortUserId}_${timestamp.toString().slice(-6)}`;

    const options = {
      amount: plan.priceMonthly * 100, // Convert to paise
      currency: "INR",
      receipt: receiptId,
      notes: {
        userId: userId.toString(),
        planId: planId.toString(),
        planName: plan.planName,
        userEmail: user.email,
        userName: user.userName,
      },
    };

    const order = await razorpayInstance.orders.create(options);

    return res.status(200).json({
      success: true,
      message: "Order created successfully",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        plan: {
          id: plan._id,
          planName: plan.planName,
          description: plan.description,
          duration: plan.duration,
          priceMonthly: plan.priceMonthly,
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

// Verify payment and activate plan
const verifyPaymentAndActivatePlan = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      planId,
    } = req.body;

    const userId = req.user.id;

    // Log incoming request data for debugging
    console.log("Payment verification request received:");
    console.log("Order ID:", razorpay_order_id);
    console.log("Payment ID:", razorpay_payment_id);
    console.log("Signature:", razorpay_signature ? `${razorpay_signature.substring(0, 20)}...` : "missing");
    console.log("Plan ID:", planId);

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !planId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: razorpay_payment_id, razorpay_order_id, razorpay_signature, planId",
      });
    }

    // Verify Razorpay signature
    const razorpaySecret = process.env.RAZORPAY_KEY_SECRET || 'IOULEZFaWRNrL92MNqF5eDr0';
    const signatureString = razorpay_order_id + "|" + razorpay_payment_id;
    
    const expectedSignature = crypto
      .createHmac("sha256", razorpaySecret)
      .update(signatureString)
      .digest("hex");

    const isAuthentic = expectedSignature === razorpay_signature;

    // Enhanced logging for debugging
    if (!isAuthentic) {
      console.error("Payment signature verification failed:");
      console.error("Order ID:", razorpay_order_id);
      console.error("Payment ID:", razorpay_payment_id);
      console.error("Signature String:", signatureString);
      console.error("Expected Signature:", expectedSignature);
      console.error("Received Signature:", razorpay_signature);
      console.error("Secret Key Present:", !!razorpaySecret);
      console.error("Secret Key Length:", razorpaySecret ? razorpaySecret.length : 0);
      
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Invalid signature.",
        error: "Signature mismatch",
        debug: process.env.NODE_ENV === 'development' ? {
          expectedSignature,
          receivedSignature: razorpay_signature,
          signatureString,
          secretKeyPresent: !!razorpaySecret,
        } : undefined,
      });
    }

    console.log("Payment signature verified successfully");

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
        message: "Only lenders can purchase plans",
      });
    }

    // Check if user already has an active plan (double-check before activation)
    if (user.currentPlanId && user.planExpiryDate) {
      const now = new Date();
      const expiryDate = new Date(user.planExpiryDate);
      
      if (expiryDate > now) {
        // User has an active plan that hasn't expired yet
        const remainingDays = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        
        return res.status(400).json({
          success: false,
          message: "You already have an active plan. Please wait until your current plan expires to purchase a new one.",
          data: {
            currentPlanExpiryDate: user.planExpiryDate,
            remainingDays: remainingDays,
            canPurchaseNewPlan: false,
          },
        });
      }
    }

    // Calculate expiry date based on plan duration
    const purchaseDate = new Date();
    let expiryDate = new Date(purchaseDate);

    switch (plan.duration) {
      case "1 month":
        expiryDate.setMonth(expiryDate.getMonth() + 1);
        break;
      case "2 months":
        expiryDate.setMonth(expiryDate.getMonth() + 2);
        break;
      case "3 months":
        expiryDate.setMonth(expiryDate.getMonth() + 3);
        break;
      case "6 months":
        expiryDate.setMonth(expiryDate.getMonth() + 6);
        break;
      case "1 year":
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        break;
      default:
        expiryDate.setMonth(expiryDate.getMonth() + 1);
    }

    // Update user with plan details
    user.currentPlanId = planId;
    user.planPurchaseDate = purchaseDate;
    user.planExpiryDate = expiryDate;
    user.razorpayOrderId = razorpay_order_id;
    user.razorpayPaymentId = razorpay_payment_id;
    user.razorpaySignature = razorpay_signature;

    await user.save();

    // Calculate remaining days
    const now = new Date();
    const remainingDays = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));

    return res.status(200).json({
      success: true,
      message: "Plan activated successfully",
      data: {
        plan: {
          id: plan._id,
          planName: plan.planName,
          description: plan.description,
          duration: plan.duration,
          priceMonthly: plan.priceMonthly,
          planFeatures: plan.planFeatures,
        },
        purchaseDate: purchaseDate,
        expiryDate: expiryDate,
        remainingDays: remainingDays,
        isActive: true,
      },
    });
  } catch (error) {
    console.error("Error verifying payment and activating plan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
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

    // Check if user has an active plan
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

    // Calculate remaining days
    const expiryDate = new Date(user.planExpiryDate);
    const remainingDays = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)));

    return res.status(200).json({
      success: true,
      message: "Active plan retrieved successfully",
      data: {
        hasActivePlan: true,
        plan: user.currentPlanId ? {
          id: user.currentPlanId._id,
          planName: user.currentPlanId.planName,
          description: user.currentPlanId.description,
          duration: user.currentPlanId.duration,
          priceMonthly: user.currentPlanId.priceMonthly,
          planFeatures: user.currentPlanId.planFeatures,
        } : null,
        purchaseDate: user.planPurchaseDate,
        expiryDate: user.planExpiryDate,
        remainingDays: remainingDays,
        isActive: true,
      },
    });
  } catch (error) {
    console.error("Error fetching active plan:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  createPlanOrder,
  verifyPaymentAndActivatePlan,
  getActivePlan,
};

