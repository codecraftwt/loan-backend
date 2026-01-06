const express = require("express");
const {
  getLoanByAadhaar,
  updateLoanAcceptanceStatus,
  makeLoanPayment,
  getPaymentHistory,
  getMyLoans,
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

// Get payment history for a loan (no authentication required)
router.get("/payment-history/:loanId", getPaymentHistory);

module.exports = router;

