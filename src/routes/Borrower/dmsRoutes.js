const express = require("express");
const router = express.Router();
const authenticateUser = require("../../middlewares/authenticateUser");
const dmsController = require("../../controllers/Borrower/dmsController");

// DMS Document Routes
router.post("/upload", authenticateUser, dmsController.uploadDocument);
router.get("/loan/:loanId", authenticateUser, dmsController.getDocumentsByLoan);
router.get("/checklist/:loanId", authenticateUser, dmsController.getDocumentChecklist);
router.patch("/verify/:documentId", authenticateUser, dmsController.verifyDocument);

module.exports = router;
