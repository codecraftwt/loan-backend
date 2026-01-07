const express = require("express");
const {
  createLoan,
  verifyLoanPayment,
  verifyOTPAndConfirmLoan,
  resendOTP,
  getLoansByLender,
  GetLoanDetails,
  editLoan,
  updateLoanStatus,
  deleteLoanDetails,
  getLoanStats,
  getRecentActivities,
  confirmPayment,
  rejectPayment,
  getPendingPayments,
  getLenderLoanStatistics,
  getBorrowerReputationByAadhaar,
} = require("../../controllers/Lender/lenderLoanController");
const authenticateUser = require("../../middlewares/authenticateUser");
const checkLender = require("../../middlewares/checkLender");
const checkActivePlan = require("../../middlewares/checkActivePlan");

const router = express.Router();

// Recent activity
router.get('/recent-activities', authenticateUser, checkLender, getRecentActivities);

// Get lender loan statistics with percentages (for dashboard/graph)
router.get('/statistics', authenticateUser, checkLender, getLenderLoanStatistics);

// Get borrower reputation score by Aadhaar number (lender)
router.get('/reputation/:aadhaarNumber', authenticateUser, checkLender, getBorrowerReputationByAadhaar);

// Create loan (only lenders can create loans for borrowers) - requires active plan
router.post("/create", authenticateUser, checkLender, checkActivePlan, createLoan);

// Verify Razorpay payment for loan creation (only for online payments)
router.post("/verify-payment", authenticateUser, checkLender, verifyLoanPayment);

// Verify OTP and confirm loan
router.post("/verify-otp", authenticateUser, checkLender, verifyOTPAndConfirmLoan);

// Resend OTP
router.post("/resend-otp", authenticateUser, checkLender, resendOTP);

// Get loans by lender (only lenders can view their loans)
router.get("/my-loans", authenticateUser, checkLender, getLoansByLender);

// Get loan details by ID (only lenders can view their loan details)
router.get("/:id", authenticateUser, checkLender, GetLoanDetails);

// Get loan stats (only lenders)
router.get("/stats/loan-stats", authenticateUser, checkLender, getLoanStats);

// Edit/Update loan (only lenders can edit their own loans)
router.patch("/:id", authenticateUser, checkLender, editLoan);

// Update loan status (mark as paid) - only lenders
router.patch("/status/:loanId", authenticateUser, checkLender, updateLoanStatus);

// Confirm loan payment (only lenders)
router.patch("/payment/confirm/:loanId/:paymentId", authenticateUser, checkLender, confirmPayment);

// Reject loan payment (only lenders)
router.patch("/payment/reject/:loanId/:paymentId", authenticateUser, checkLender, rejectPayment);

// Get pending payments for lender review
router.get("/payments/pending", authenticateUser, checkLender, getPendingPayments);

// Delete loan (only lenders can delete their loans)
router.delete("/:id", authenticateUser, checkLender, deleteLoanDetails);

module.exports = router;

