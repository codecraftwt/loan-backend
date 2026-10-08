const mongoose = require("mongoose");

const loanApplicationSchema = new mongoose.Schema(
  {
    // Unique group identifier for applications sent together in a single batch (max 8)
    applicationGroupId: {
      type: String,
      required: true,
      index: true,
    },
    borrowerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, "Loan amount is required"],
      min: [1000, "Loan amount must be at least 1,000"],
    },
    purpose: {
      type: String,
      required: [true, "Loan purpose is required"],
      default: "Working Capital",
    },
    tenureMonths: {
      type: Number,
      required: [true, "Tenure in months is required"],
      default: 12,
    },
    requestedRate: {
      type: Number,
      default: 10.5,
    },
    repaymentType: {
      type: String,
      enum: ["EMI", "ONE_TIME"],
      default: "EMI",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "auto_rejected"],
      default: "pending",
      index: true,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    actionTakenAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
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

    // Loan Agreement & E-Signatures
    agreement: {
      documentId: { type: String, default: null },
      agreementHtml: { type: String, default: null },
      status: {
        type: String,
        enum: ["pending_lender", "lender_signed", "borrower_signed", "fully_executed"],
        default: "pending_lender",
      },
      sanctionTerms: {
        amount: Number,
        repaymentType: { type: String, enum: ["EMI", "ONE_TIME"], default: "EMI" },
        interestRate: Number,
        tenureMonths: Number,
        processingFee: { type: Number, default: 0 },
        monthlyEmi: { type: Number, default: 0 },
        totalInterest: { type: Number, default: 0 },
        totalPayable: { type: Number, default: 0 },
        maturityDate: Date,
        firstDueDate: Date,
      },
      lenderSignature: {
        signatureData: { type: String, default: null },
        signedBy: { type: String, default: null },
        signedAt: { type: Date, default: null },
        ipAddress: { type: String, default: null },
      },
      borrowerSignature: {
        signatureData: { type: String, default: null },
        signedBy: { type: String, default: null },
        signedAt: { type: Date, default: null },
        ipAddress: { type: String, default: null },
      },
      executedAt: { type: Date, default: null },
    },

    // Immutable snapshots at the time of application submission
    borrowerSnapshot: {
      userName: String,
      email: String,
      mobileNo: String,
      altMobileNo: String,
      address: String,
      city: String,
      taluka: String,
      district: String,
      state: String,
      pincode: String,
      businessName: String,
      businessType: String,
      employmentType: String,
      annualRevenue: Number,
      monthlyIncome: Number,
      creditScore: Number,
      riskGrade: String,
      panCardNumber: String,
      aadharCardNo: String,
      gstNumber: String,
      yearsInBusiness: Number,
      totalLoansTaken: Number,
      onTimeRepayments: Number,
      defaultsCount: Number,
    },
    lenderSnapshot: {
      userName: String,
      companyName: String,
      email: String,
      mobileNo: String,
      minInterestRate: Number,
      maxInterestRate: Number,
      servicesOffered: [String],
    },
  },
  { timestamps: true }
);

// Compound index for querying a borrower's active application with a specific lender
loanApplicationSchema.index({ borrowerId: 1, lenderId: 1, status: 1 });
loanApplicationSchema.index({ applicationGroupId: 1, status: 1 });

const LoanApplication = mongoose.model("LoanApplication", loanApplicationSchema);
module.exports = LoanApplication;
