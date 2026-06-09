const express = require("express");
const router = express.Router();

const { verifyPin } = require("../../controllers/Auth/pinController");
const authenticateUser = require("../../middlewares/authenticateUser");

router.post("/verify", authenticateUser, verifyPin);

module.exports = router;
