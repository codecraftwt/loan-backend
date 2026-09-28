const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    category: {
      type: String,
      enum: ["financials", "property", "legal_entity", "closing", "other"],
      required: true,
      default: "financials",
    },
    docType: {
      type: String,
      enum: [
        "bank_statement",
        "tax_return",
        "w2",
        "pnl_statement",
        "purchase_contract",
        "appraisal_report",
        "scope_of_work",
        "title_commitment",
        "insurance_policy",
        "llc_operating_agreement",
        "articles_of_organization",
        "certificate_of_good_standing",
        "kyc_id",
        "proof_of_funds",
        "other",
      ],
      required: true,
      default: "other",
    },
    title: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: "application/pdf",
    },
    version: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ["pending", "under_review", "verified", "rejected"],
      default: "pending",
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    aiExtraction: {
      isProcessed: { type: Boolean, default: false },
      confidenceScore: { type: Number, default: 0 },
      detectedDocType: { type: String },
      extractedFields: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      summary: { type: String },
      redFlags: [
        {
          code: { type: String },
          message: { type: String },
          severity: { type: String, enum: ["low", "medium", "high", "critical"] },
        },
      ],
      processedAt: { type: Date },
    },
  },
  { timestamps: true }
);

const Document = mongoose.model("Document", documentSchema);
module.exports = Document;
