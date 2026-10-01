const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
  {
    // Basic identifiers & contact
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    borrowerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    aadhaarNumber: {
      type: String,
      required: false,
      default: "",
    },
    mobileNumber: {
      type: String,
      required: [true, "Mobile number is required"],
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
    dealName: {
      type: String,
      default: "",
    },
    purpose: {
      type: String,
      default: "Commercial Real Estate Loan",
    },

    // Pipeline & Workflow Stage
    pipelineStage: {
      type: String,
      enum: [
        "intake",
        "doc_collection",
        "underwriting",
        "committee_review",
        "term_sheet_issued",
        "processing_title",
        "approved_funded",
        "closed",
        "rejected",
      ],
      default: "intake",
      index: true,
    },
    loanPurpose: {
      type: String,
      enum: [
        "acquisition",
        "refinance",
        "fix_and_flip",
        "ground_up_construction",
        "bridge",
        "other",
      ],
      default: "fix_and_flip",
    },

    // Commercial Real Estate & Collateral Details
    propertyDetails: {
      address: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      propertyType: {
        type: String,
        enum: [
          "single_family",
          "multi_family",
          "multifamily",
          "commercial",
          "commercial_retail",
          "office",
          "industrial",
          "mixed_use",
          "land",
          "other",
        ],
        default: "single_family",
      },
      unitsCount: { type: Number, default: 1 },
      squareFeet: { type: Number, default: 0 },
      purchasePrice: { type: Number, default: 0 },
      asIsValue: { type: Number, default: 0 },
      arv: { type: Number, default: 0 }, // After-Repair Value
      rehabBudget: { type: Number, default: 0 },
      estimatedMonthlyRent: { type: Number, default: 0 },
      annualTaxes: { type: Number, default: 0 },
      annualInsurance: { type: Number, default: 0 },
      occupancyStatus: { type: String, default: "vacant" },
    },

    // Borrowing Entity & Signer Details
    entityDetails: {
      entityType: {
        type: String,
        enum: ["llc", "llp", "corporation", "partnership", "trust", "individual", "other"],
        default: "llc",
      },
      entityName: { type: String, default: "" },
      ein: { type: String, default: "" },
      stateOfIncorporation: { type: String, default: "" },
      authorizedSignerName: { type: String, default: "" },
      authorizedSignerTitle: { type: String, default: "Managing Member" },
    },

    // Borrower Experience & Sponsor Track Record
    borrowerExperience: {
      completedProjects: { type: Number, default: 0 },
      yearsExperience: { type: Number, default: 0 },
      totalVolumeCompleted: { type: Number, default: 0 },
      currentLiquidity: { type: Number, default: 0 },
      creditScore: { type: Number, default: 700 },
      exitStrategy: { type: String, default: "sale" }, // 'sale', 'refinance', 'hold'
    },

    // Underwriting & Financial Calculation Engine Outputs
    underwriting: {
      loanAmount: { type: Number, default: 0 },
      requestedTermMonths: { type: Number, default: 12 },
      interestRate: { type: Number, default: 10.5 }, // %
      originationPoints: { type: Number, default: 2.0 }, // %
      underwritingFee: { type: Number, default: 1500 },
      processingFee: { type: Number, default: 995 },
      ltv: { type: Number, default: 0 }, // Loan to As-Is Value %
      arvLtv: { type: Number, default: 0 }, // Loan to ARV %
      ltc: { type: Number, default: 0 }, // Loan to Cost %
      dscr: { type: Number, default: 0 }, // Debt Service Coverage Ratio
      cashRequiredToClose: { type: Number, default: 0 },
      monthlyInterestPayment: { type: Number, default: 0 },
      interestReserveMonths: { type: Number, default: 6 },
      interestReserveAmount: { type: Number, default: 0 },
      isDutchInterest: { type: Boolean, default: false },
      netOperatingIncome: { type: Number, default: 0 },
      annualDebtService: { type: Number, default: 0 },
      validationStatus: {
        isValid: { type: Boolean, default: true },
        messages: [{ type: String }],
      },
      calculatedAt: { type: Date },
    },

    // Multi-Factor Risk Assessment & Tiering
    riskAssessment: {
      collateralScore: { type: Number, default: 80 },
      experienceScore: { type: Number, default: 75 },
      liquidityScore: { type: Number, default: 85 },
      exitStrategyScore: { type: Number, default: 80 },
      overallScore: { type: Number, default: 80 },
      riskTier: {
        type: String,
        enum: ["Tier 1 - Low Risk", "Tier 2 - Moderate Risk", "Tier 3 - High Risk"],
        default: "Tier 1 - Low Risk",
      },
      redFlags: [
        {
          code: { type: String },
          severity: { type: String, enum: ["low", "medium", "high", "critical"] },
          message: { type: String },
          mitigant: { type: String },
        },
      ],
      assessedAt: { type: Date },
    },

    // Underwriting Memo & Investment Committee Output
    underwritingMemo: {
      executiveSummary: { type: String, default: "" },
      borrowerBio: { type: String, default: "" },
      propertyAnalysis: { type: String, default: "" },
      financialStrengths: [{ type: String }],
      riskMitigations: [{ type: String }],
      recommendation: {
        type: String,
        enum: ["approve", "conditional_approval", "decline", "more_info_needed"],
        default: "conditional_approval",
      },
      notes: { type: String, default: "" },
      updatedAt: { type: Date },
    },

    // Letter of Intent (LOI) & Term Sheet Generator
    termSheet: {
      termSheetNumber: { type: String, default: "" },
      loanAmount: { type: Number, default: 0 },
      interestRate: { type: Number, default: 0 },
      termMonths: { type: Number, default: 12 },
      originationPoints: { type: Number, default: 2.0 },
      requiredReservesMonths: { type: Number, default: 6 },
      prepaymentPenalty: { type: String, default: "None (3 months minimum interest)" },
      conditionsPrecedent: [{ type: String }],
      status: {
        type: String,
        enum: ["not_issued", "issued", "accepted", "rejected", "negotiating"],
        default: "not_issued",
      },
      issuedDate: { type: Date },
      acceptedDate: { type: Date },
      borrowerSignature: { type: String },
      lenderSignature: { type: String },
      pdfUrl: { type: String },
    },

    // Closing Conditions & Tasks Checklist
    conditionsChecklist: [
      {
        title: { type: String, required: true },
        category: {
          type: String,
          enum: [
            "borrower_kyc",
            "property_valuation",
            "property",
            "entity",
            "title_legal",
            "insurance",
            "financials",
            "closing",
            "other",
          ],
          default: "financials",
        },
        status: {
          type: String,
          enum: ["pending", "in_progress", "submitted", "satisfied", "waived"],
          default: "pending",
        },
        assignedRole: { type: String, default: "borrower" },
        notes: { type: String, default: "" },
        completedAt: { type: Date },
      },
    ],

    // Link to application if originated via online marketplace
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      index: true,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "closed", "defaulted", "settled", "pending", "pending_disbursal"],
      default: "active",
      index: true,
    },
    // Disbursal 2-Way OTP Verification
    disbursalVerification: {
      otp: { type: String, default: null },
      otpExpiresAt: { type: Date, default: null },
      otpAttempts: { type: Number, default: 0 },
      isVerified: { type: Boolean, default: false },
      verifiedAt: { type: Date, default: null },
      disbursedAt: { type: Date, default: null },
      disbursalMode: { type: String, default: "direct" },
    },
    repaymentType: {
      type: String,
      enum: ["installment", "one-time"],
      default: "installment",
    },
    repaymentMethod: {
      type: String,
      enum: ["reducing", "flat", "bullet"],
      default: "reducing",
    },
    interestRate: {
      type: Number,
      default: 12,
    },
    tenureMonths: {
      type: Number,
      default: 12,
    },
    monthlyEmi: {
      type: Number,
      default: 0,
    },
    totalRepaymentExpected: {
      type: Number,
      default: function () {
        return this.amount;
      },
    },
    totalInterestExpected: {
      type: Number,
      default: 0,
    },
    // Detailed schedule array for each installment
    installments: [
      {
        installmentNumber: { type: Number, required: true },
        dueDate: { type: Date, required: true },
        principalAmount: { type: Number, default: 0 },
        interestAmount: { type: Number, default: 0 },
        totalAmount: { type: Number, required: true },
        paidAmount: { type: Number, default: 0 },
        status: {
          type: String,
          enum: ["pending", "partially_paid", "paid", "overdue", "waived"],
          default: "pending",
        },
        paidAt: { type: Date, default: null },
        penaltyAmount: { type: Number, default: 0 },
        transactionReference: { type: String, default: null },
        notes: { type: String, default: "" },
      },
    ],

    // Legacy and Repayment tracking fields
    loanStartDate: {
      type: Date,
      default: Date.now,
    },
    loanEndDate: {
      type: Date,
    },
    agreement: {
      type: String,
    },
    digitalSignature: {
      type: String,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "part paid", "paid", "overdue"],
      default: "pending",
    },
    borrowerAcceptanceStatus: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "accepted",
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
    paymentType: {
      type: String,
      enum: ["one-time", "installment"],
      default: null,
    },
    loanMode: {
      type: String,
      enum: ["cash", "online"],
      default: null,
    },
    paymentMode: {
      type: String,
      enum: ["cash", "online"],
      default: null,
    },
    razorpayOrderId: {
      type: String,
      default: null,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
    },
    razorpaySignature: {
      type: String,
      default: null,
    },
    razorpayPaymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: null,
    },
    totalPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingAmount: {
      type: Number,
      default: function () {
        return this.amount;
      },
    },
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
        default: function () {
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
    paymentHistory: [
      {
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
        installmentNumber: {
          type: Number,
          default: null,
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
          type: String,
          default: null,
        },
        razorpayOrderId: {
          type: String,
          default: null,
        },
        razorpayPaymentId: {
          type: String,
          default: null,
        },
        razorpaySignature: {
          type: String,
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
      },
    ],
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
    proof: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const Loan = mongoose.model("Loan", loanSchema);

module.exports = Loan;