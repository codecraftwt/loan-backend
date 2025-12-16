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
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: false,
    },
    razorpaySubscriptionId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
      required: false,
    },
    razorpayOrderId: {
      type: String,
      required: false,
    },
    razorpaySignature: {
      type: String,
      required: false,
    },
    amount: {
      type: Number,
      required: false,
    },
    status: {
      type: String,
      enum: [
        "created",
        "authenticated",
        "active",
        "pending",
        "halted",
        "cancelled",
        "completed",
        "expired",
      ],
      default: "created",
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: false,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "captured", "failed", "refunded"],
      default: "pending",
    },
    isActive: {
      type: Boolean,
      default: true
    },

    // Plan details stored directly in the user record
    subscriptionPlan: {
      name: {
        type: String,
      },
      description: {
        type: String,
      },
      amount: {
        type: Number,
      },
      duration: {
        type: String, // 'monthly', 'yearly', etc.
      },
      maxLoans: {
        type: Number,
      },
      features: {
        type: [String], // List of features (e.g., 'Advanced Analytics', 'Priority Support')
      },
    }
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
