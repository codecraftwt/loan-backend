const express = require("express");
const router = express.Router();
const authenticateUser = require("../../middlewares/authenticateUser");
const underwritingController = require("../../controllers/Loans/underwritingController");

// Underwriting & Deal Pipeline Routes
router.get("/pipeline", authenticateUser, underwritingController.getDealPipeline);
router.get("/deal/:loanId", authenticateUser, underwritingController.getDealDetails);
router.post("/calculate/:loanId", authenticateUser, underwritingController.calculateUnderwriting);
router.post("/risk-assessment/:loanId", authenticateUser, underwritingController.evaluateRiskAssessment);
router.post("/generate-memo/:loanId", authenticateUser, underwritingController.generateUnderwritingMemo);
router.post("/issue-term-sheet/:loanId", authenticateUser, underwritingController.issueTermSheet);
router.post("/accept-term-sheet/:loanId", authenticateUser, underwritingController.acceptTermSheet);
router.patch("/stage/:loanId", authenticateUser, underwritingController.updatePipelineStage);
router.patch("/conditions/:loanId", authenticateUser, underwritingController.updateDealConditions);

module.exports = router;
