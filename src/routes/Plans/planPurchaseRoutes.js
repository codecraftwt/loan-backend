const express = require("express");
const router = express.Router();
const authenticateUser = require("../../middlewares/authenticateUser");
const checkLender = require("../../middlewares/checkLender");
const {
  createPlanOrder,
  verifyPaymentAndActivatePlan,
  getActivePlan,
  getSubscriptionHistory,
} = require("../../controllers/Plans/planPurchaseController");

// All routes require authentication and lender role
router.post("/purchase/order", authenticateUser, checkLender, createPlanOrder);
router.post("/purchase/verify", authenticateUser, checkLender, verifyPaymentAndActivatePlan);
router.get("/active", authenticateUser, checkLender, getActivePlan);
router.get("/purchase/history", authenticateUser, checkLender, getSubscriptionHistory);
router.get("/history", authenticateUser, checkLender, getSubscriptionHistory);

module.exports = router;