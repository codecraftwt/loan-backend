const express = require("express");
const {
  getLoanByAadhaar,
  updateLoanAcceptanceStatus,
} = require("../../controllers/Borrower/borrowerLoanController");
const authenticateUser = require("../../middlewares/authenticateUser");
const checkBorrower = require("../../middlewares/checkBorrower");

const router = express.Router();

// Get loans by Aadhaar (borrower views their loans)
router.get("/by-aadhar", authenticateUser, checkBorrower, getLoanByAadhaar);

// Update loan acceptance status (borrower accepts/rejects)
router.patch(
  "/acceptance/:loanId",
  authenticateUser,
  checkBorrower,
  updateLoanAcceptanceStatus
);

module.exports = router;

