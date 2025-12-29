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
    }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
