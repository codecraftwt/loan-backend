const express = require("express");
const router = express.Router();
const authenticateUser = require("../../middlewares/authenticateUser");
const {
  getAvailableBorrowers,
  getBorrowerDetails,
  getIncomingRequests,
  getRequestById,
  acceptLoanRequest,
  rejectLoanRequest,
  getLenderProfile,
  updateLenderProfile,
  getLenderDashboardStats,
  getLenderLoansPortfolio,
  getLenderLoanById,
  recordLoanPayment,
  recalculateLoanSchedule,
  initiateLoanDisbursalOtp,
  verifyLoanDisbursalOtp,
  getLenderNotifications,
  markLenderNotificationRead,
} = require("../../controllers/Lender/lenderFlowController");

// Available borrowers directory for lenders
router.get("/available-borrowers", authenticateUser, getAvailableBorrowers);
router.get("/borrowers/:id", authenticateUser, getBorrowerDetails);

// Incoming borrower loan requests
router.get("/incoming-requests", authenticateUser, getIncomingRequests);
router.get("/requests/:id", authenticateUser, getRequestById);

// Decision actions: Accept (with atomic auto-rejection & active loan initialization) or Reject
router.post("/requests/:id/accept", authenticateUser, acceptLoanRequest);
router.post("/requests/:id/reject", authenticateUser, rejectLoanRequest);

// Borrower Disbursal 2-Way OTP Verification
router.post("/requests/:id/initiate-disbursal", authenticateUser, initiateLoanDisbursalOtp);
router.post("/requests/:id/verify-disbursal-otp", authenticateUser, verifyLoanDisbursalOtp);
router.post("/requests/:id/resend-disbursal-otp", authenticateUser, initiateLoanDisbursalOtp);
router.post("/loans/:id/initiate-disbursal", authenticateUser, initiateLoanDisbursalOtp);
router.post("/loans/:id/verify-disbursal-otp", authenticateUser, verifyLoanDisbursalOtp);
router.post("/loans/:id/resend-disbursal-otp", authenticateUser, initiateLoanDisbursalOtp);

// Active Loan Portfolio & Repayment Ledger
router.get("/loans", authenticateUser, getLenderLoansPortfolio);
router.get("/loans/:id", authenticateUser, getLenderLoanById);
router.post("/loans/:id/record-payment", authenticateUser, recordLoanPayment);
router.post("/loans/:id/recalculate", authenticateUser, recalculateLoanSchedule);

// Lender profile & terms setup
router.get("/profile", authenticateUser, getLenderProfile);
router.put("/profile", authenticateUser, updateLenderProfile);

// In-app Notifications
router.get("/notifications", authenticateUser, getLenderNotifications);
router.patch("/notifications/:id/read", authenticateUser, markLenderNotificationRead);

// Lender dashboard stats
router.get("/dashboard-stats", authenticateUser, getLenderDashboardStats);

module.exports = router;
