const express = require("express");
const router = express.Router();
const authenticateUser = require("../middlewares/authenticateUser");
const {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  createSubscriptionOrder,
  verifyPaymentAndActivateSubscription,
  getUserActiveSubscription,
  handleRazorpayWebhook,
  cancelUserSubscription,
  getSubscriptionStats,
  testPurchaseSubscription
} = require("../controllers/Subscriptions/SubscriptionController");

// Public routes
router.get("/plans", getAllSubscriptionPlans);
router.get("/plans/:id", getSubscriptionPlanById);
router.post("/webhook", handleRazorpayWebhook);

// Protected routes (require authentication)
router.post("/plans", authenticateUser, createSubscriptionPlan);
router.put("/plans/:id", authenticateUser, updateSubscriptionPlan);
router.post("/create-order", authenticateUser, createSubscriptionOrder);
router.post("/verify-payment", authenticateUser, verifyPaymentAndActivateSubscription);
router.get("/my-subscription", authenticateUser, getUserActiveSubscription);
router.delete("/cancel", authenticateUser, cancelUserSubscription);
router.get("/stats", authenticateUser, getSubscriptionStats);
router.post("/test-purchase", authenticateUser, testPurchaseSubscription);

module.exports = router;