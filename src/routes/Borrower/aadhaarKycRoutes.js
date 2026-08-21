const express = require("express");
const { sendAadhaarOtp, verifyAadhaarOtp } = require("../../controllers/Borrower/aadhaarKycController");
const authenticateUser = require("../../middlewares/authenticateUser");
const checkBorrower = require("../../middlewares/checkBorrower");

const router = express.Router();

router.post("/send-otp", authenticateUser, checkBorrower, sendAadhaarOtp);
router.post("/verify-otp", authenticateUser, checkBorrower, verifyAadhaarOtp);

module.exports = router;
