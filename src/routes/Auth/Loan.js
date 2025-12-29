const express = require("express");
const {
  AddLoan,
  ShowAllLoan,
  GetLoanDetails,
  deleteLoanDetails,
  updateLoanDetails,
  getLoansByLender,
  getLoanByAadhaar,
  updateLoanStatus,
  getLoansById,
  getLoanStats,
  updateLoanAcceptanceStatus,
  getRecentActivities,
} = require("../../controllers/Loans/LoansController");
const authenticateUser = require("../../middlewares/authenticateUser");
const router = express.Router();

//recent activity
router.get('/recent-activities', authenticateUser, getRecentActivities);

router.post("/add-loan", authenticateUser, AddLoan);

router.get("/get-loan-by-lender", authenticateUser, getLoansByLender);

router.get("/get-loan-by-aadhar", getLoanByAadhaar);

router.get("/get-loan-by-id", authenticateUser, getLoansById);

// router.get("/get-loan", ShowAllLoan);

router.get("/get-loan", GetLoanDetails);

router.get("/loan-stats", authenticateUser, getLoanStats);

router.delete("/:id", deleteLoanDetails);

router.patch("/update-loan-status/:loanId", updateLoanStatus);

router.patch(
  "/update-loan-acceptance-status/:loanId",
  updateLoanAcceptanceStatus
);

router.patch("/:id", updateLoanDetails);

module.exports = router;