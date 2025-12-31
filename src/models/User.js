const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      sparse: false,
      lowercase: true,
      trim: true,
    },
    userName: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    profileImage: {
      type: String,
    },
    panCardNumber: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
    },
    address: {
      type: String,
      required: true,
    },
    aadharCardNo: {
      type: String,
      required: true,
      unique: true,
      // match: [/^\d{12}$/, "Please provide a valid 12-digit Aadhar number"],
    },
    mobileNo: {
      type: String,
      required: true,
      unique: true,
      // stored in E.164 format: +911234567890
    },
    roleId: {
      type: Number,
      enum: [0, 1, 2], // 0 - admin, 1 - lender, 2 - borrower
      required: true,
      default: 2,
    },
    firebaseUid: {
      type: String,
    },
    isMobileVerified: {
      type: Boolean,
      default: false,
    },
    // Store multiple device tokens as an array
    deviceTokens: [
      {
        type: String, // Each device token will be stored as a string
        required: false, // Tokens are optional initially and will be updated later
      },
    ],
    isActive: {
      type: Boolean,
      default: true
    },
    // Plan purchase details
    currentPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: false,
    },
    planPurchaseDate: {
      type: Date,
      required: false,
    },
    planExpiryDate: {
      type: Date,
      required: false,
    },
    razorpayOrderId: {
      type: String,
      required: false,
    },
    razorpayPaymentId: {
      type: String,
      required: false,
    },
    razorpaySignature: {
      type: String,
      required: false,
    },
    // Fraud detection fields (for borrowers)
    fraudDetection: {
      fraudScore: {
        type: Number,
        default: 0,
      },
      riskLevel: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "low",
      },
      flags: {
        multipleLoansInShortTime: { type: Boolean, default: false },
        hasPendingLoans: { type: Boolean, default: false },
        hasOverdueLoans: { type: Boolean, default: false },
        totalActiveLoans: { type: Number, default: 0 },
        totalPendingLoans: { type: Number, default: 0 },
        totalOverdueLoans: { type: Number, default: 0 },
        lastFraudCheck: { type: Date, default: Date.now },
      },
      fraudHistory: [{
        detectedAt: { type: Date, default: Date.now },
        fraudScore: { type: Number },
        riskLevel: { type: String },
        reason: { type: String },
        details: { type: mongoose.Schema.Types.Mixed },
      }],
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
