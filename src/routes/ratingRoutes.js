const express = require("express");
const {
  submitRating,
  getUserRating,
  getAllRatings,
  updateRatingStatus,
} = require("../controllers/ratingController");
const authenticateUser = require("../middlewares/authenticateUser");

const router = express.Router();

router.post("/submit", authenticateUser, submitRating);
router.get("/my-rating", authenticateUser, getUserRating);
router.get("/all", authenticateUser, getAllRatings);
router.patch("/update-status", authenticateUser, updateRatingStatus);

module.exports = router;