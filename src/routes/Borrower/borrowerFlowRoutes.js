const express = require("express");
const router = express.Router();
const authenticateUser = require("../../middlewares/authenticateUser");
const {
  getAvailableLenders,
  getLenderById,
  toggleFavoriteLender,
  getFavoriteLenders,
  submitLoanApplications,
  getMyApplications,
  getBorrowerNotifications,
  markNotificationRead,
  getBorrowerProfile,
  updateBorrowerProfile,
  getBorrowerDashboardStats,
} = require("../../controllers/Borrower/borrowerFlowController");

// Lenders marketplace for borrowers
router.get("/lenders", authenticateUser, getAvailableLenders);
router.get("/lenders/:id", authenticateUser, getLenderById);
router.post("/favorites/:lenderId/toggle", authenticateUser, toggleFavoriteLender);
router.get("/favorites", authenticateUser, getFavoriteLenders);

// Multi-lender application submission (max 8) & tracking
router.post("/applications", authenticateUser, submitLoanApplications);
router.get("/my-applications", authenticateUser, getMyApplications);

// In-app notifications
router.get("/notifications", authenticateUser, getBorrowerNotifications);
router.patch("/notifications/:id/read", authenticateUser, markNotificationRead);

// Profile management
router.get("/profile", authenticateUser, getBorrowerProfile);
router.put("/profile", authenticateUser, updateBorrowerProfile);

// Dashboard overview stats
router.get("/dashboard-stats", authenticateUser, getBorrowerDashboardStats);

module.exports = router;
