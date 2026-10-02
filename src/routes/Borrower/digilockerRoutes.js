const express = require("express");
const {
  initiateDigilockerSession,
  verifyDigilockerSession,
  getDigilockerKycStatus,
  resetDigilockerKyc,
} = require("../../controllers/Borrower/digilockerController");
const authenticateUser = require("../../middlewares/authenticateUser");

const router = express.Router();

// DigiLocker endpoints
router.post("/initiate", authenticateUser, initiateDigilockerSession);
router.post("/verify", authenticateUser, verifyDigilockerSession);
router.get("/status", authenticateUser, getDigilockerKycStatus);
router.post("/reset", authenticateUser, resetDigilockerKyc);

module.exports = router;
