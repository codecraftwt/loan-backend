const express = require("express");
const {
  getAllBorrowersHistory,
  getBorrowerHistoryByLenderId,
  getBorrowerHistoryByBorrowerId,
  getBorrowerHistoryByBorrowerAndLenderId,
  getAllLoansByLenderId,
} = require("../../controllers/History/historyController");
const authenticateUser = require("../../middlewares/authenticateUser");

const router = express.Router();

/**
 * @route   GET /api/history/borrowers
 * @desc    Get all borrowers history without any lender or borrower id filter
 * @access  Private (requires authentication)
 */
router.get("/borrowers", authenticateUser, getAllBorrowersHistory);

/**
 * @route   GET /api/history/borrowers/lender/:lenderId
 * @desc    Get borrower history by lender ID
 * @access  Private (requires authentication)
 */
router.get("/borrowers/lender/:lenderId", authenticateUser, getBorrowerHistoryByLenderId);

/**
 * @route   GET /api/history/borrowers/borrower/:borrowerId
 * @desc    Get borrower history by borrower ID
 * @access  Private (requires authentication)
 */
router.get("/borrowers/borrower/:borrowerId", authenticateUser, getBorrowerHistoryByBorrowerId);

/**
 * @route   GET /api/history/borrowers/borrower/:borrowerId/lender/:lenderId
 * @desc    Get borrower history by both borrower ID and lender ID
 * @access  Private (requires authentication)
 */
router.get("/borrowers/borrower/:borrowerId/lender/:lenderId", authenticateUser, getBorrowerHistoryByBorrowerAndLenderId);

/**
 * @route   GET /api/history/loans/lender/:lenderId
 * @desc    Get all loans given by a lender (by lender ID)
 * @access  Private (requires authentication)
 */
router.get("/loans/lender/:lenderId", authenticateUser, getAllLoansByLenderId);

module.exports = router;


