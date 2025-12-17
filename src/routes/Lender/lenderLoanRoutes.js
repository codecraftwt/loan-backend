const express = require("express");
const {
  AddLoan,
  getLoansByLender,
  GetLoanDetails,
  updateLoanDetails,
  updateLoanStatus,
  deleteLoanDetails,
  getLoanStats,
  getRecentActivities,
} = require("../../controllers/Lender/lenderLoanController");
const authenticateUser = require("../../middlewares/authenticateUser");
const checkSubscription = require("../../middlewares/subscriptionCheck");

const router = express.Router();

// Recent activity
router.get('/recent-activities', authenticateUser, getRecentActivities);

// Create loan (lender)
router.post("/add-loan", authenticateUser, checkSubscription, AddLoan);

// Get loans by lender
router.get("/get-loan-by-lender", authenticateUser, getLoansByLender);

// Get loan details by ID
router.get("/get-loan/:id", authenticateUser, GetLoanDetails);

// Get loan stats
router.get("/loan-stats", authenticateUser, getLoanStats);

// Update loan details
router.patch("/:id", authenticateUser, updateLoanDetails);

// Update loan status (mark as paid)
router.patch("/update-loan-status/:loanId", authenticateUser, updateLoanStatus);

// Delete loan
router.delete("/:id", authenticateUser, deleteLoanDetails);

module.exports = router;

