const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "loan_accepted",
        "loan_auto_rejected",
        "loan_rejected",
        "loan_received",
        "disbursal_otp",
        "loan_disbursed",
        "loan_payment_confirmed",
        "loan_given",
        "loan_taken",
        "info",
      ],
      default: "info",
    },
    metadata: {
      applicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LoanApplication",
      },
      loanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Loan",
      },
      applicationGroupId: String,
      amount: Number,
      lenderName: String,
      borrowerName: String,
      rejectionReason: String,
      otp: String,
      expiresAt: Date,
      autoRejectedCount: Number,
      acceptedByLender: String,
      remainingAmount: Number,
      transactionReference: String,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
