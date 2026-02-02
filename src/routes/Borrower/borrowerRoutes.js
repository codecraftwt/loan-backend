const express = require("express");
const {
  getAllBorrowers,
  getBorrowerById,
  searchBorrowers,
} = require("../../controllers/Borrower/borrowerController");
const borrowerLoanRoutes = require("./borrowerLoanRoutes");
const authenticateUser = require("../../middlewares/authenticateUser");

const router = express.Router();

// Get all borrowers with pagination
router.get("/borrowers", authenticateUser, getAllBorrowers);

// Search borrowers by name, Aadhar number, or phone number
router.get("/borrowers/search", authenticateUser, searchBorrowers);

// Get borrower by ID
router.get("/borrowers/:id", authenticateUser, getBorrowerById);

// Loan routes for borrowers
router.use("/loans", borrowerLoanRoutes);

module.exports = router;