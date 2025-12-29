const express = require("express");
const authenticateUser = require("../../middlewares/authenticateUser");
const checkAdmin = require("../../middlewares/checkAdmin");
const checkAdminOrLender = require("../../middlewares/checkAdminOrLender");
const { 
  createPlan, 
  editPlan, 
  getAllPlans, 
  getActivePlans, 
  getPlanById 
} = require("../../controllers/Admin/adminController");

const router = express.Router();

// Admin only routes - Create and Edit plans
router.post("/plans", authenticateUser, checkAdmin, createPlan);
router.put("/plans/:id", authenticateUser, checkAdmin, editPlan);
router.patch("/plans/:id", authenticateUser, checkAdmin, editPlan); // Support PATCH as well

// Admin and Lender routes - View plans
// Note: /plans/active must come before /plans/:id to avoid route conflicts
router.get("/plans/active", authenticateUser, checkAdminOrLender, getActivePlans); // Get all active plans
router.get("/plans", authenticateUser, checkAdminOrLender, getAllPlans); // Get all plans (including inactive)
router.get("/plans/:id", authenticateUser, checkAdminOrLender, getPlanById); // Get single plan by ID

module.exports = router;
