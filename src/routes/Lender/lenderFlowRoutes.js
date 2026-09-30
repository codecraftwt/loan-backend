const express = require("express");
const router = express.Router();
const authenticateUser = require("../../middlewares/authenticateUser");
const {
  getAvailableBorrowers,
  getBorrowerDetails,
  getIncomingRequests,
  getRequestById,
  acceptLoanRequest,
  rejectLoanRequest,
  getLenderProfile,
  updateLenderProfile,
  getLenderDashboardStats,
} = require("../../controllers/Lender/lenderFlowController");

// Available borrowers directory for lenders
router.get("/available-borrowers", authenticateUser, getAvailableBorrowers);
router.get("/borrowers/:id", authenticateUser, getBorrowerDetails);

// Incoming borrower loan requests
router.get("/incoming-requests", authenticateUser, getIncomingRequests);
router.get("/requests/:id", authenticateUser, getRequestById);

// Decision actions: Accept (with atomic auto-rejection) or Reject
router.post("/requests/:id/accept", authenticateUser, acceptLoanRequest);
router.post("/requests/:id/reject", authenticateUser, rejectLoanRequest);

// Lender profile & terms setup
router.get("/profile", authenticateUser, getLenderProfile);
router.put("/profile", authenticateUser, updateLenderProfile);

// Lender dashboard stats
router.get("/dashboard-stats", authenticateUser, getLenderDashboardStats);

module.exports = router;
