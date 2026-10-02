const express = require("express");
const authenticateUser = require("../../middlewares/authenticateUser");
const checkAdmin = require("../../middlewares/checkAdmin");
const checkAdminOrLender = require("../../middlewares/checkAdminOrLender");
const { 
  createPlan, 
  editPlan, 
  deletePlan,
  getAllPlans, 
  getActivePlans, 
  getPlanById,
  getLendersWithPlans,
  getAdminRevenue,
  getRecentActivities,
  getBorrowersByLender,
  impersonateLender,
  getLenderSubscriptionHistory
} = require("../../controllers/Admin/adminController");
const { getBorrowerById } = require("../../controllers/Borrower/borrowerController");
const checkLender = require("../../middlewares/checkLender");

const router = express.Router();

// Admin only routes - Create and Edit plans
router.post("/plans", authenticateUser, checkAdmin, createPlan);  
router.put("/plans/:id", authenticateUser, checkAdmin, editPlan);
router.patch("/plans/:id", authenticateUser, checkAdmin, editPlan);
router.delete("/plans/:id", authenticateUser, checkAdmin, deletePlan);

// Impersonate lender (admin only)
router.post("/lenders/:lenderId/impersonate", authenticateUser, checkAdmin, impersonateLender);

// Admin and Lender routes - View plans
router.get("/plans/active", authenticateUser, checkAdminOrLender, getActivePlans); // Get all active plans
router.get("/plans", authenticateUser, checkAdminOrLender, getAllPlans); // Get all plans (including inactive)
router.get("/plans/:id", authenticateUser, checkAdminOrLender, getPlanById); // Get single plan by ID

// Admin only routes - Lenders with plans & Subscriptions
router.get("/lenders/plans", authenticateUser, checkAdmin, getLendersWithPlans); // Get all lenders with plan purchase details
router.get("/lenders/:lenderId/subscriptions", authenticateUser, checkAdmin, getLenderSubscriptionHistory); // Get specific lender's subscription history
router.get("/lenders/:lenderId/borrowers", authenticateUser, checkAdminOrLender, getBorrowersByLender);

// Admin only routes - Revenue statistics
router.get("/revenue", authenticateUser, checkAdmin, getAdminRevenue); // Get admin revenue statistics

// Admin only routes - Recent activities
router.get("/recent-activities", authenticateUser, checkAdmin, getRecentActivities); // Get admin recent activities

// Admin & Lender routes - Single Borrower Details
router.get("/borrowers/:id/details", authenticateUser, checkAdminOrLender, getBorrowerById);
router.get("/borrowers/:id", authenticateUser, checkAdminOrLender, getBorrowerById);

module.exports = router;
