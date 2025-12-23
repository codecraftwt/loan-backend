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
    loanEndDate: {
      type: Date,
      validate: {
        validator: (v) => v > Date.now(),
        message:
          "Loan end date is already passed, request lender to extend the loan",
      },
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
    purpose: {
      type: String,
      required: [true, "Purpose of loan is required"],
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "part paid", "paid", "overdue"],
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
    otpVerified: {
      type: String,
      enum: ["pending", "verified"],
      default: "pending",
    },
    // Payment tracking fields
    paymentType: {
      type: String,
      enum: ["one-time", "installment"],
      default: null,
    },
    paymentMode: {
      type: String,
      enum: ["cash", "online"],
      default: null,
    },
    totalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: function() {
        return this.amount;
      },
    },
    // Installment tracking
    installmentPlan: {
      totalInstallments: {
        type: Number,
        default: 1,
      },
      paidInstallments: {
        type: Number,
        default: 0,
      },
      installmentAmount: {
        type: Number,
        default: function() {
          return this.amount;
        },
      },
      nextDueDate: {
        type: Date,
        default: null,
      },
      installmentFrequency: {
        type: String,
        enum: ["weekly", "monthly", "quarterly"],
        default: "monthly",
      },
    },
    // Payment history
    paymentHistory: [{
      amount: {
        type: Number,
        required: true,
      },
      paymentMode: {
        type: String,
        enum: ["cash", "online"],
        required: true,
      },
      paymentType: {
        type: String,
        enum: ["one-time", "installment"],
        required: true,
      },
      paymentDate: {
        type: Date,
        default: Date.now,
      },
      transactionId: {
        type: String,
        default: null,
      },
      notes: {
        type: String,
        default: null,
      },
      paymentProof: {
        type: String, // File path/URL for payment proof
        default: null,
      },
      paymentStatus: {
        type: String,
        enum: ["pending", "confirmed", "rejected"],
        default: "pending",
      },
      confirmedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      confirmedAt: {
        type: Date,
        default: null,
      },
    }],
    // Overdue tracking
    overdueDetails: {
      isOverdue: {
        type: Boolean,
        default: false,
      },
      overdueAmount: {
        type: Number,
        default: 0,
      },
      overdueDays: {
        type: Number,
        default: 0,
      },
      lastOverdueCheck: {
        type: Date,
        default: Date.now,
      },
      overdueNotified: {
        type: Boolean,
        default: false,
      },
    },
    profileImage: {
      type: String,
    },
  },
  { timestamps: true }
);

const Loan = mongoose.model("Loan", loanSchema);

module.exports = Loan;
