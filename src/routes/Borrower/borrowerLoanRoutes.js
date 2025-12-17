const express = require("express");
const {
  getLoanByAadhaar,
  updateLoanAcceptanceStatus,
} = require("../../controllers/Borrower/borrowerLoanController");
const authenticateUser = require("../../middlewares/authenticateUser");

const router = express.Router();

// Get loans by Aadhaar (borrower views their loans)
router.get("/get-loan-by-aadhar", authenticateUser, getLoanByAadhaar);

// Update loan acceptance status (borrower accepts/rejects)
router.patch(
  "/update-loan-acceptance-status/:loanId",
  authenticateUser,
  updateLoanAcceptanceStatus
);

module.exports = router;

