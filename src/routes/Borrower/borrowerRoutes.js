const express = require("express");
const {
  getAllBorrowers,
  getBorrowerById,
  searchBorrowers,
} = require("../../controllers/Borrower/borrowerController");
const borrowerLoanRoutes = require("./borrowerLoanRoutes");
const aadhaarKycRoutes = require("./aadhaarKycRoutes");
const digilockerRoutes = require("./digilockerRoutes");
const authenticateUser = require("../../middlewares/authenticateUser");

const router = express.Router();

// Get all borrowers with pagination
router.get("/borrowers", authenticateUser, getAllBorrowers);

// Search borrowers by name, Aadhar number, or phone number
router.get("/borrowers/search", authenticateUser, searchBorrowers);

// Get borrower by ID
router.get("/borrowers/:id", authenticateUser, getBorrowerById);

// Loan routes for borrowers (mounted on /loans and / for backwards & direct URL compatibility)
router.use("/loans", borrowerLoanRoutes);
router.use("/", borrowerLoanRoutes);

// Aadhaar eKYC routes for borrowers (mock — see aadhaarKycController.js)
router.use("/ekyc/aadhaar", aadhaarKycRoutes);

// DigiLocker e-KYC Verification routes
router.use("/kyc/digilocker", digilockerRoutes);

module.exports = router;