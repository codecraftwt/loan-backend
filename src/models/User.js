const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    userName: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    profileImage: {
      type: String,
    },
    address: {
      type: String,
      required: true,
    },
    aadharCardNo: {
      type: String,
      required: true,
      // match: [/^\d{12}$/, "Please provide a valid 12-digit Aadhar number"],
    },
    mobileNo: {
      type: String,
      required: true,
      // match: [/^\d{10}$/, "Please provide a valid 10-digit mobile number"],
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
      ref: 'Subscription',
      required: true
    },
    razorpaySubscriptionId: {
      type: String
    },
    razorpayPaymentId: {
      type: String,
      required: true
    },
    razorpayOrderId: {
      type: String,
      required: true
    },
    razorpaySignature: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired'],
      default: 'created'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'captured', 'failed', 'refunded'],
      default: 'pending'
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
