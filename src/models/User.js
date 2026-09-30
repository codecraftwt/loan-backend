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
    },
    mobileNo: {
      type: String,
      required: true,
      unique: true,
    },
    altMobileNo: {
      type: String,
      default: "",
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
    pinHash: {
      type: String,
      required: false,
      select: false,
    },
    pinCreatedAt: {
      type: Date,
      required: false,
    },
    // Store multiple device tokens as an array
    deviceTokens: [
      {
        type: String,
        required: false,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
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

    // ─── Streamlined Lender Profile (Rates, Services, History) ───
    lenderProfile: {
      minInterestRate: {
        type: Number,
        default: null,
      },
      maxInterestRate: {
        type: Number,
        default: null,
      },
      servicesOffered: {
        type: [String],
        default: [],
      },
      totalLoansFunded: {
        type: Number,
        default: 0,
      },
      totalDisbursedAmount: {
        type: Number,
        default: 0,
      },
      experienceYears: {
        type: Number,
        default: 0,
      },
      approvalRate: {
        type: Number,
        default: 0,
      },
      rating: {
        type: Number,
        default: 0,
      },
      ratingCount: {
        type: Number,
        default: 0,
      },
      bio: {
        type: String,
        default: "",
      },
      minLoanAmount: {
        type: Number,
        default: null,
      },
      maxLoanAmount: {
        type: Number,
        default: null,
      },
      turnaroundTime: {
        type: String,
        default: "",
      },
    },

    // ─── Streamlined Borrower Profile (Financials, Credit, History) ───
    borrowerProfile: {
      businessName: {
        type: String,
        default: "",
      },
      businessType: {
        type: String,
        default: "Private Limited Company",
      },
      annualRevenue: {
        type: Number,
        default: 0,
      },
      monthlyIncome: {
        type: Number,
        default: 0,
      },
      creditScore: {
        type: Number,
        default: 750, // 300 to 900
      },
      riskGrade: {
        type: String,
        default: "A",
      },
      gstNumber: {
        type: String,
        default: "",
      },
      yearsInBusiness: {
        type: Number,
        default: 3,
      },
      totalLoansTaken: {
        type: Number,
        default: 0,
      },
      onTimeRepayments: {
        type: Number,
        default: 0,
      },
      defaultsCount: {
        type: Number,
        default: 0,
      },
      employmentType: {
        type: String,
        default: "Business Owner / Self-Employed",
      },
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
      fraudHistory: [
        {
          detectedAt: { type: Date, default: Date.now },
          fraudScore: { type: Number },
          riskLevel: { type: String },
          reason: { type: String },
          details: { type: mongoose.Schema.Types.Mixed },
        },
      ],
    },

    companyName: {
      type: String,
      default: "",
    },
    ein: {
      type: String,
      default: "",
    },
    licenseNumber: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    taluka: {
      type: String,
      default: "",
    },
    district: {
      type: String,
      default: "",
    },
    state: {
      type: String,
      default: "",
    },
    pincode: {
      type: String,
      default: "",
    },
    stateOfOperation: {
      type: String,
      default: "",
    },
    subscriptionQuotas: {
      activeDealsCount: { type: Number, default: 0 },
      aiCreditsUsed: { type: Number, default: 0 },
      aiCreditsLimit: { type: Number, default: 50 },
    },
    favoriteLenders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
