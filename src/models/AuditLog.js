const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loan",
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
    },
    userRole: {
      type: String,
      enum: ["admin", "lender", "borrower", "system"],
      default: "system",
    },
    action: {
      type: String,
      required: true,
    },
    module: {
      type: String,
      enum: ["intake", "underwriting", "risk_scoring", "documents", "term_sheet", "status_change", "condition", "subscription"],
      default: "intake",
    },
    details: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
    },
  },
  { timestamps: true }
);

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
module.exports = AuditLog;
