const Loan = require("../../models/Loan");
const User = require("../../models/User");
const Plan = require("../../models/Plan");
const {
  sendOverdueLoanNotificationToLender,
  sendOverdueLoanNotificationToBorrower,
  sendPendingPaymentNotificationToLender,
  sendPendingLoanNotificationToLender,
  sendPendingLoanNotificationToBorrower,
  sendSubscriptionReminderNotification,
} = require("../../services/notificationService");

// Manually trigger overdue loan notifications
const sendOverdueLoanNotifications = async (req, res) => {
  try {
    const currentDate = new Date();
    const overdueLoans = await Loan.find({
      "overdueDetails.isOverdue": true,
      paymentStatus: { $ne: "paid" },
      loanConfirmed: true,
      borrowerAcceptanceStatus: "accepted",
    })
      .populate("lenderId", "userName")
      .lean();

    let lenderNotifiedCount = 0;
    let borrowerNotifiedCount = 0;
    const errors = [];

    for (const loan of overdueLoans) {
      try {
        const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
        const lenderName = loan.lenderId?.userName || "Lender";
        const borrowerName = borrower?.userName || "Borrower";

        if (loan.lenderId) {
          await sendOverdueLoanNotificationToLender(loan.lenderId._id, loan, borrowerName);
          lenderNotifiedCount++;
        }

        if (borrower) {
          await sendOverdueLoanNotificationToBorrower(loan.aadhaarNumber, loan, lenderName);
          borrowerNotifiedCount++;
        }
      } catch (loanError) {
        errors.push({ loanId: loan._id, error: loanError.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Overdue loan notifications sent",
      data: {
        totalOverdueLoans: overdueLoans.length,
        lendersNotified: lenderNotifiedCount,
        borrowersNotified: borrowerNotifiedCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Error sending overdue loan notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Manually trigger pending payment notifications
const sendPendingPaymentNotifications = async (req, res) => {
  try {
    const loansWithPendingPayments = await Loan.find({
      "paymentHistory.paymentStatus": "pending",
      loanConfirmed: true,
      borrowerAcceptanceStatus: "accepted",
    })
      .populate("lenderId", "userName")
      .lean();

    let notifiedCount = 0;
    const errors = [];

    for (const loan of loansWithPendingPayments) {
      try {
        const pendingPayments = loan.paymentHistory.filter(
          (p) => p.paymentStatus === "pending"
        );

        if (pendingPayments.length > 0 && loan.lenderId) {
          const latestPendingPayment = pendingPayments[pendingPayments.length - 1];
          const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
          const borrowerName = borrower?.userName || "Borrower";

          await sendPendingPaymentNotificationToLender(
            loan.lenderId._id,
            loan,
            borrowerName,
            latestPendingPayment.amount,
            latestPendingPayment.paymentMode
          );
          notifiedCount++;
        }
      } catch (loanError) {
        errors.push({ loanId: loan._id, error: loanError.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Pending payment notifications sent",
      data: {
        totalLoansWithPendingPayments: loansWithPendingPayments.length,
        lendersNotified: notifiedCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Error sending pending payment notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Manually trigger pending loan notifications
const sendPendingLoanNotifications = async (req, res) => {
  try {
    const pendingLoans = await Loan.find({
      borrowerAcceptanceStatus: "pending",
      loanConfirmed: false,
    })
      .populate("lenderId", "userName")
      .lean();

    let lenderNotifiedCount = 0;
    let borrowerNotifiedCount = 0;
    const errors = [];

    for (const loan of pendingLoans) {
      try {
        const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
        const lenderName = loan.lenderId?.userName || "Lender";
        const borrowerName = borrower?.userName || "Borrower";

        if (loan.lenderId) {
          await sendPendingLoanNotificationToLender(loan.lenderId._id, loan, borrowerName);
          lenderNotifiedCount++;
        }

        if (borrower) {
          await sendPendingLoanNotificationToBorrower(loan.aadhaarNumber, loan, lenderName);
          borrowerNotifiedCount++;
        }
      } catch (loanError) {
        errors.push({ loanId: loan._id, error: loanError.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Pending loan notifications sent",
      data: {
        totalPendingLoans: pendingLoans.length,
        lendersNotified: lenderNotifiedCount,
        borrowersNotified: borrowerNotifiedCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Error sending pending loan notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Manually trigger subscription reminder notifications
const sendSubscriptionReminderNotifications = async (req, res) => {
  try {
    const currentDate = new Date();
    const lenders = await User.find({
      roleId: 1,
      isActive: true,
      currentPlanId: { $exists: true, $ne: null },
      planExpiryDate: { $exists: true, $ne: null },
    })
      .populate("currentPlanId")
      .lean();

    let notifiedCount = 0;
    const errors = [];

    for (const lender of lenders) {
      try {
        if (!lender.planExpiryDate || !lender.currentPlanId) continue;

        const expiryDate = new Date(lender.planExpiryDate);
        const remainingDays = Math.ceil((expiryDate - currentDate) / (1000 * 60 * 60 * 24));

        // Send reminders at: 7 days, 3 days, 1 day, and on expiry day
        if (remainingDays === 7 || remainingDays === 3 || remainingDays === 1 || remainingDays === 0) {
          await sendSubscriptionReminderNotification(
            lender._id,
            lender.currentPlanId.planName || "Subscription",
            remainingDays,
            expiryDate
          );
          notifiedCount++;
        }
      } catch (lenderError) {
        errors.push({ lenderId: lender._id, error: lenderError.message });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Subscription reminder notifications sent",
      data: {
        totalLendersWithPlans: lenders.length,
        lendersNotified: notifiedCount,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    console.error("Error sending subscription reminder notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

// Send all notifications (overdue, pending payments, pending loans, subscriptions)
const sendAllNotifications = async (req, res) => {
  try {
    const results = {
      overdue: { lenders: 0, borrowers: 0 },
      pendingPayments: { lenders: 0 },
      pendingLoans: { lenders: 0, borrowers: 0 },
      subscriptions: { lenders: 0 },
    };

    // Overdue loans
    const overdueLoans = await Loan.find({
      "overdueDetails.isOverdue": true,
      paymentStatus: { $ne: "paid" },
      loanConfirmed: true,
      borrowerAcceptanceStatus: "accepted",
    })
      .populate("lenderId", "userName")
      .lean();

    for (const loan of overdueLoans) {
      try {
        const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
        const lenderName = loan.lenderId?.userName || "Lender";
        const borrowerName = borrower?.userName || "Borrower";

        if (loan.lenderId) {
          await sendOverdueLoanNotificationToLender(loan.lenderId._id, loan, borrowerName);
          results.overdue.lenders++;
        }
        if (borrower) {
          await sendOverdueLoanNotificationToBorrower(loan.aadhaarNumber, loan, lenderName);
          results.overdue.borrowers++;
        }
      } catch (error) {
        console.error(`Error in overdue notification for loan ${loan._id}:`, error);
      }
    }

    // Pending payments
    const loansWithPendingPayments = await Loan.find({
      "paymentHistory.paymentStatus": "pending",
      loanConfirmed: true,
      borrowerAcceptanceStatus: "accepted",
    })
      .populate("lenderId", "userName")
      .lean();

    for (const loan of loansWithPendingPayments) {
      try {
        const pendingPayments = loan.paymentHistory.filter((p) => p.paymentStatus === "pending");
        if (pendingPayments.length > 0 && loan.lenderId) {
          const latestPendingPayment = pendingPayments[pendingPayments.length - 1];
          const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
          const borrowerName = borrower?.userName || "Borrower";

          await sendPendingPaymentNotificationToLender(
            loan.lenderId._id,
            loan,
            borrowerName,
            latestPendingPayment.amount,
            latestPendingPayment.paymentMode
          );
          results.pendingPayments.lenders++;
        }
      } catch (error) {
        console.error(`Error in pending payment notification for loan ${loan._id}:`, error);
      }
    }

    // Pending loans
    const pendingLoans = await Loan.find({
      borrowerAcceptanceStatus: "pending",
      loanConfirmed: false,
    })
      .populate("lenderId", "userName")
      .lean();

    for (const loan of pendingLoans) {
      try {
        const borrower = await User.findOne({ aadharCardNo: loan.aadhaarNumber });
        const lenderName = loan.lenderId?.userName || "Lender";
        const borrowerName = borrower?.userName || "Borrower";

        if (loan.lenderId) {
          await sendPendingLoanNotificationToLender(loan.lenderId._id, loan, borrowerName);
          results.pendingLoans.lenders++;
        }
        if (borrower) {
          await sendPendingLoanNotificationToBorrower(loan.aadhaarNumber, loan, lenderName);
          results.pendingLoans.borrowers++;
        }
      } catch (error) {
        console.error(`Error in pending loan notification for loan ${loan._id}:`, error);
      }
    }

    // Subscription reminders
    const currentDate = new Date();
    const lenders = await User.find({
      roleId: 1,
      isActive: true,
      currentPlanId: { $exists: true, $ne: null },
      planExpiryDate: { $exists: true, $ne: null },
    })
      .populate("currentPlanId")
      .lean();

    for (const lender of lenders) {
      try {
        if (!lender.planExpiryDate || !lender.currentPlanId) continue;
        const expiryDate = new Date(lender.planExpiryDate);
        const remainingDays = Math.ceil((expiryDate - currentDate) / (1000 * 60 * 60 * 24));

        if (remainingDays === 7 || remainingDays === 3 || remainingDays === 1 || remainingDays === 0) {
          await sendSubscriptionReminderNotification(
            lender._id,
            lender.currentPlanId.planName || "Subscription",
            remainingDays,
            expiryDate
          );
          results.subscriptions.lenders++;
        }
      } catch (error) {
        console.error(`Error in subscription reminder for lender ${lender._id}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      message: "All notifications sent successfully",
      data: results,
    });
  } catch (error) {
    console.error("Error sending all notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: error.message,
    });
  }
};

module.exports = {
  sendOverdueLoanNotifications,
  sendPendingPaymentNotifications,
  sendPendingLoanNotifications,
  sendSubscriptionReminderNotifications,
  sendAllNotifications,
};

