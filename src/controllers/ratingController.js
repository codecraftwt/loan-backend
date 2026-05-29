const Rating = require("../models/Rating");
const User = require("../models/User");

const submitRating = async (req, res) => {
  const { rating, feedback, selectedOptions } = req.body;
  const userId = req.user.id;

  try {
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating is required and must be between 1 and 5",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingRating = await Rating.findOne({ userId });
    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted a rating",
      });
    }

    const newRating = await Rating.create({
      userId,
      userName: user.userName,
      mobileNo: user.mobileNo,
      rating,
      feedback: feedback || "",
      selectedOptions: selectedOptions || [],
    });

    return res.status(201).json({
      success: true,
      message: "Rating submitted successfully",
      data: newRating,
    });
  } catch (error) {
    console.error("Error submitting rating:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

const getUserRating = async (req, res) => {
  const userId = req.user.id;

  try {
    const rating = await Rating.findOne({ userId });
    
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "No rating found for this user",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Rating fetched successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Error fetching user rating:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

const getAllRatings = async (req, res) => {
  try {
    const ratings = await Rating.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "All ratings fetched successfully",
      count: ratings.length,
      data: ratings,
    });
  } catch (error) {
    console.error("Error fetching all ratings:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

const updateRatingStatus = async (req, res) => {
  const { ratingId, isResolved, status } = req.body;

  try {
    const rating = await Rating.findById(ratingId);
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    if (isResolved !== undefined) {
      rating.isResolved = isResolved;
    }
    if (status) {
      rating.status = status;
    }

    await rating.save();

    return res.status(200).json({
      success: true,
      message: "Rating status updated successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Error updating rating status:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  submitRating,
  getUserRating,
  getAllRatings,
  updateRatingStatus,
};