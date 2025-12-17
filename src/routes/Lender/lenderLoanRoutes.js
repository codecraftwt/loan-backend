const express = require("express");
const {
  createLoan,
  verifyOTPAndConfirmLoan,
  resendOTP,
  getLoansByLender,
  GetLoanDetails,
  editLoan,
  updateLoanStatus,
  deleteLoanDetails,
  getLoanStats,
  getRecentActivities,
} = require("../../controllers/Lender/lenderLoanController");
const authenticateUser = require("../../middlewares/authenticateUser");
const checkLender = require("../../middlewares/checkLender");
// Subscription middleware commented out
// const checkSubscription = require("../../middlewares/subscriptionCheck");

const router = express.Router();

// Recent activity
router.get('/recent-activities', authenticateUser, checkLender, getRecentActivities);

// Create loan (only lenders can create loans for borrowers)
// Subscription check commented out
router.post("/create", authenticateUser, checkLender, createLoan);

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

// Delete loan (only lenders can delete their loans)
router.delete("/:id", authenticateUser, checkLender, deleteLoanDetails);

module.exports = router;

