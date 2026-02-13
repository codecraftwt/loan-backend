const express = require("express");
const {
  getLoanByAadhaar,
  updateLoanAcceptanceStatus,
  makeLoanPayment,
  getPaymentHistory,
  getMyLoans,
  getBorrowerStatistics,
  getBorrowerRecentActivities,
  createRazorpayOrderForPayment,
  verifyRazorpayPayment,
  getInstallmentHistory,
} = require("../../controllers/Borrower/borrowerLoanController");
const multer = require("multer");
const path = require("path");

// Configure multer for payment proof uploads (using memory storage for Cloudinary)
const paymentProofStorage = multer.memoryStorage();

const uploadPaymentProof = multer({
  storage: paymentProofStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files (JPEG, JPG, PNG) and PDF files are allowed"));
    }
  },
});
const authenticateUser = require("../../middlewares/authenticateUser");
const checkBorrower = require("../../middlewares/checkBorrower");

const router = express.Router();

// Get borrower recent activities
router.get("/recent-activities", authenticateUser, checkBorrower, getBorrowerRecentActivities);

// Get borrower loan statistics with percentages (for dashboard/graph)
router.get("/statistics", authenticateUser, checkBorrower, getBorrowerStatistics);

// Get borrower's loans by borrower ID (no authentication required)
router.get("/my-loans", getMyLoans);

// Get loans by Aadhaar (borrower views their loans)
router.get("/by-aadhar", authenticateUser, checkBorrower, getLoanByAadhaar);

// Update loan acceptance status (borrower accepts/rejects)
router.patch(
  "/acceptance/:loanId",
  authenticateUser,
  checkBorrower,
  updateLoanAcceptanceStatus
);

// Make loan payment (borrower pays loan) - for cash payments
router.post(
  "/payment/:loanId",
  authenticateUser,
  checkBorrower,
  uploadPaymentProof.single("paymentProof"),
  makeLoanPayment
);

// Create Razorpay order for borrower loan payment
router.post(
  "/razorpay/create-order/:loanId",
  authenticateUser,
  checkBorrower,
  createRazorpayOrderForPayment
);

// Verify Razorpay payment for borrower loan repayment
router.post(
  "/razorpay/verify-payment/:loanId",
  authenticateUser,
  checkBorrower,
  verifyRazorpayPayment
);

// Get payment history for a loan (no authentication required)
router.get("/payment-history/:loanId", getPaymentHistory);

// Get installment history for a loan (installment loans only)
router.get("/installment-history/:loanId", authenticateUser, checkBorrower, getInstallmentHistory);module.exports = router;
