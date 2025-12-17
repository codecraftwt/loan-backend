const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    aadhaarNumber: {
      type: String,
      required: [true, "Aadhaar number is required"],
      length: [12, "Aadhaar number must be 12 digits"],
      match: [/^\d{12}$/, "Aadhaar number must be 12 digits"],
    },
    mobileNumber: {
      type: String,
      required: [true, "Mobile number is required"],
      length: [10, "Mobile number must be 10 digits"],
      match: [/^\d{10}$/, "Mobile number must be a valid 10-digit number"],
    },
    address: {
      type: String,
      required: [true, "Address is required"],
    },
    amount: {
      type: Number,
      required: [true, "Loan amount is required"],
      min: [1000, "Loan amount must be at least 1000"],
      validate: {
        validator: (v) => v > 0,
        message: "Loan amount must be a positive number",
      },
    },
    loanStartDate: {
      type: Date,
      default: Date.now,
    },
    loanGivenDate: {
      type: Date,
      required: [true, "Loan given date is required"],
    },
    loanEndDate: {
      type: Date,
      required: [true, "Loan end date (due date) is required"],
      validate: {
        validator: function(v) {
          // Allow same day but ensure it's not in the past
          return v >= new Date(new Date().setHours(0,0,0,0));
        },
        message: "Loan end date cannot be in the past",
      },
    },
    loanMode: {
      type: String,
      enum: ["cash", "online"],
      required: [true, "Loan mode is required"],
    },
    agreement: {
      type: String,
    },
    digitalSignature: {
      type: String,
    },
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Lender ID is required"],
    },
    borrowerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    purpose: {
      type: String,
      required: [true, "Purpose of loan is required"],
    },
    status: {
      type: String,
      enum: ["pending", "paid"],
      default: "pending",
    },
    borrowerAcceptanceStatus: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpiry: {
      type: Date,
      default: null,
    },
    loanConfirmed: {
      type: Boolean,
      default: false,
    },
    profileImage: {
      type: String,
    },
  },
  { timestamps: true }
);

const Loan = mongoose.model("Loan", loanSchema);

module.exports = Loan;
