const mongoose = require("mongoose");

const subscriptionHistorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },
    planName: {
      type: String,
      required: true,
    },
    duration: {
      type: String,
      default: "1 month",
    },
    durationDays: {
      type: Number,
      required: true,
      default: 30,
    },
    price: {
      type: Number,
      required: true,
    },
    priceMonthly: {
      type: Number,
    },
    tag: {
      type: String,
      default: "",
    },
    razorpayOrderId: {
      type: String,
      required: true,
    },
    razorpayPaymentId: {
      type: String,
      required: true,
    },
    razorpaySignature: {
      type: String,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["completed", "pending", "failed"],
      default: "completed",
    },
    isExtension: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const SubscriptionHistory = mongoose.model(
  "SubscriptionHistory",
  subscriptionHistorySchema
);

module.exports = SubscriptionHistory;
