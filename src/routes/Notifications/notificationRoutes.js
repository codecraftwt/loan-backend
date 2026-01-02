const express = require("express");
const router = express.Router();
const authenticateUser = require("../../middlewares/authenticateUser");
const checkAdmin = require("../../middlewares/checkAdmin");
const {
  sendOverdueLoanNotifications,
  sendPendingPaymentNotifications,
  sendPendingLoanNotifications,
  sendSubscriptionReminderNotifications,
  sendAllNotifications,
} = require("../../controllers/Notifications/notificationController");

// All notification endpoints require admin authentication
router.post(
  "/overdue-loans",
  authenticateUser,
  checkAdmin,
  sendOverdueLoanNotifications
);

router.post(
  "/pending-payments",
  authenticateUser,
  checkAdmin,
  sendPendingPaymentNotifications
);

router.post(
  "/pending-loans",
  authenticateUser,
  checkAdmin,
  sendPendingLoanNotifications
);

router.post(
  "/subscription-reminders",
  authenticateUser,
  checkAdmin,
  sendSubscriptionReminderNotifications
);

router.post(
  "/all",
  authenticateUser,
  checkAdmin,
  sendAllNotifications
);

module.exports = router;

