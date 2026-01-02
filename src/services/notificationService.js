const messaging = require("../config/firebaseConfig");
const User = require("../models/User");

async function sendLoanStatusNotification(userId, loanUser, loanStatus) {
  try {
    // Find the user by userId to get the device tokens
    const user = await User.findById(userId);
    if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
      return;
    }

    // Prepare the notification message
    const message = {
      notification: {
        title: "Loan Status Update",
        body: `The loan has been ${loanStatus} by ${loanUser}`,
      },
      data: {
        loanStatus: loanStatus, // Additional data you might want to send
        screen: "Outward",
        notificationId: `${
          user.userName
        }_${Date.now().toString()}_${Math.random()
          .toString(36)
          .substring(2, 10)}`,
      },
    };

    // Send the notification to all device tokens
    const promises = user.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending notification to token ${token}:`, error);
        // Handle invalid tokens - you might want to remove them
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
          // Optionally remove invalid token from user's deviceTokens array
        }
      });
    });

    // Wait for all notifications to be sent
    await Promise.all(promises);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

async function sendLoanUpdateNotification(aadhaarNumber, loan) {
  try {
    const user = await User.findOne({ aadharCardNo: aadhaarNumber });

    if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${
      user.userName
    }_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    // Prepare the notification message
    const message = {
      notification: {
        title: "Loan Update",
        body: `Your loan has been processed and the details have been updated.`,
      },
      data: {
        // loanStatus: loanStatus, // Additional data you might want to send
        screen: "Outward",
        notificationId: notificationId,
      },
    };

    // Send the notification to all device tokens
    const promises = user.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending notification to token ${token}:`, error);
        // Handle invalid tokens - you might want to remove them
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
          // Optionally remove invalid token from user's deviceTokens array
        }
      });
    });

    // Wait for all notifications to be sent
    await Promise.all(promises);

  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

async function sendMobileNumberChangeNotification(lenderId, borrowerName, oldMobileNo, newMobileNo) {
  try {
    // Find the lender by lenderId to get the device tokens
    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    // Prepare the notification message
    const message = {
      notification: {
        title: "Borrower Mobile Number Changed",
        body: `${borrowerName} changed the mobile number from ${oldMobileNo} to ${newMobileNo}`,
      },
      data: {
        screen: "Outward",
        notificationId: notificationId,
        type: "mobile_number_change",
      },
    };

    // Send the notification to all device tokens
    const promises = lender.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending notification to token ${token}:`, error);
        // Handle invalid tokens - you might want to remove them
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
          // Optionally remove invalid token from lender's deviceTokens array
        }
      });
    });

    // Wait for all notifications to be sent
    await Promise.all(promises);

  } catch (error) {
    console.error("Error sending mobile number change notification:", error);
  }
}

async function sendFraudAlertNotification(lenderId, fraudDetails, borrowerName, loanId = null) {
  try {
    // Find the lender by lenderId to get the device tokens
    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    // Determine notification title and body based on risk level
    let title, body;
    
    if (fraudDetails.riskLevel === "critical") {
      title = "CRITICAL: Fraud Alert";
      body = `Borrower ${borrowerName} has been flagged as CRITICAL RISK. ${fraudDetails.totalOverdueLoans || 0} overdue loans, ${fraudDetails.totalPendingLoans || 0} pending loans. Immediate action required.`;
    } else if (fraudDetails.riskLevel === "high") {
      title = "High Risk Fraud Alert";
      body = `Borrower ${borrowerName} has been flagged for HIGH RISK. Fraud Score: ${fraudDetails.fraudScore}. Review immediately.`;
    } else if (fraudDetails.riskLevel === "medium") {
      title = "Fraud Alert - Medium Risk";
      body = `Borrower ${borrowerName} has been flagged for MEDIUM RISK. Fraud Score: ${fraudDetails.fraudScore}. Proceed with caution.`;
    } else {
      title = "Fraud Warning";
      body = `Borrower ${borrowerName} has some fraud indicators. Fraud Score: ${fraudDetails.fraudScore}.`;
    }

    // Prepare the notification message
    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        screen: loanId ? "LoanDetails" : "CreateLoan",
        notificationId: notificationId,
        type: "fraud_alert",
        fraudScore: fraudDetails.fraudScore.toString(),
        riskLevel: fraudDetails.riskLevel,
        borrowerName: borrowerName,
        ...(loanId && { loanId: loanId.toString() }),
      },
    };

    // Send the notification to all device tokens
    const promises = lender.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending notification to token ${token}:`, error);
        // Handle invalid tokens
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
        }
      });
    });

    // Wait for all notifications to be sent
    await Promise.all(promises);

  } catch (error) {
    console.error("Error sending fraud alert notification:", error);
  }
}

// Send overdue loan notification to lender
async function sendOverdueLoanNotificationToLender(lenderId, loan, borrowerName) {
  try {
    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_overdue_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;
    const overdueDays = loan.overdueDetails?.overdueDays || 0;
    const overdueAmount = loan.overdueDetails?.overdueAmount || loan.remainingAmount || 0;

    const message = {
      notification: {
        title: "Overdue Loan Alert",
        body: `Loan from ${borrowerName} is overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}. Amount: ₹${overdueAmount}`,
      },
      data: {
        screen: "LoanDetails",
        notificationId: notificationId,
        type: "overdue_loan",
        loanId: loan._id.toString(),
        borrowerName: borrowerName,
        overdueDays: overdueDays.toString(),
        overdueAmount: overdueAmount.toString(),
      },
    };

    const promises = lender.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending overdue notification to lender ${token}:`, error);
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
        }
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error sending overdue loan notification to lender:", error);
  }
}

// Send overdue loan notification to borrower
async function sendOverdueLoanNotificationToBorrower(borrowerAadhaar, loan, lenderName) {
  try {
    const borrower = await User.findOne({ aadharCardNo: borrowerAadhaar });
    if (!borrower || !borrower.deviceTokens || borrower.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${borrower.userName}_overdue_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;
    const overdueDays = loan.overdueDetails?.overdueDays || 0;
    const overdueAmount = loan.overdueDetails?.overdueAmount || loan.remainingAmount || 0;

    const message = {
      notification: {
        title: "Loan Overdue Reminder",
        body: `Your loan to ${lenderName} is overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}. Please pay ₹${overdueAmount} to avoid further issues.`,
      },
      data: {
        screen: "LoanDetails",
        notificationId: notificationId,
        type: "overdue_loan",
        loanId: loan._id.toString(),
        lenderName: lenderName,
        overdueDays: overdueDays.toString(),
        overdueAmount: overdueAmount.toString(),
      },
    };

    const promises = borrower.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending overdue notification to borrower ${token}:`, error);
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
        }
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error sending overdue loan notification to borrower:", error);
  }
}

// Send pending payment notification to lender
async function sendPendingPaymentNotificationToLender(lenderId, loan, borrowerName, paymentAmount, paymentMode) {
  try {
    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_pending_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;
    const paymentModeText = paymentMode === "online" ? "online (Razorpay)" : "cash";

    const message = {
      notification: {
        title: "Pending Payment Request",
        body: `${borrowerName} has submitted a payment of ₹${paymentAmount} via ${paymentModeText}. Please confirm or reject.`,
      },
      data: {
        screen: "LoanDetails",
        notificationId: notificationId,
        type: "pending_payment",
        loanId: loan._id.toString(),
        borrowerName: borrowerName,
        paymentAmount: paymentAmount.toString(),
        paymentMode: paymentMode,
      },
    };

    const promises = lender.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending pending payment notification to lender ${token}:`, error);
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
        }
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error sending pending payment notification to lender:", error);
  }
}

// Send pending loan notification to lender (loans waiting for borrower acceptance)
async function sendPendingLoanNotificationToLender(lenderId, loan, borrowerName) {
  try {
    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_pending_loan_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    const message = {
      notification: {
        title: "Pending Loan Acceptance",
        body: `Loan of ₹${loan.amount} to ${borrowerName} is waiting for borrower acceptance.`,
      },
      data: {
        screen: "LoanDetails",
        notificationId: notificationId,
        type: "pending_loan",
        loanId: loan._id.toString(),
        borrowerName: borrowerName,
        loanAmount: loan.amount.toString(),
      },
    };

    const promises = lender.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending pending loan notification to lender ${token}:`, error);
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
        }
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error sending pending loan notification to lender:", error);
  }
}

// Send pending loan notification to borrower (loans waiting for acceptance)
async function sendPendingLoanNotificationToBorrower(borrowerAadhaar, loan, lenderName) {
  try {
    const borrower = await User.findOne({ aadharCardNo: borrowerAadhaar });
    if (!borrower || !borrower.deviceTokens || borrower.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${borrower.userName}_pending_loan_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    const message = {
      notification: {
        title: "New Loan Offer",
        body: `${lenderName} has offered you a loan of ₹${loan.amount}. Please accept or reject.`,
      },
      data: {
        screen: "LoanDetails",
        notificationId: notificationId,
        type: "pending_loan",
        loanId: loan._id.toString(),
        lenderName: lenderName,
        loanAmount: loan.amount.toString(),
      },
    };

    const promises = borrower.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending pending loan notification to borrower ${token}:`, error);
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
        }
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error sending pending loan notification to borrower:", error);
  }
}

// Send subscription reminder notification to lender
async function sendSubscriptionReminderNotification(lenderId, planName, remainingDays, expiryDate) {
  try {
    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_subscription_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    let title, body;
    if (remainingDays === 0) {
      title = "Subscription Expired";
      body = `Your ${planName} subscription has expired today. Please renew to continue using the platform.`;
    } else if (remainingDays <= 3) {
      title = "Subscription Expiring Soon";
      body = `Your ${planName} subscription expires in ${remainingDays} day${remainingDays !== 1 ? 's' : ''}. Please renew to avoid service interruption.`;
    } else if (remainingDays <= 7) {
      title = "Subscription Reminder";
      body = `Your ${planName} subscription expires in ${remainingDays} days. Consider renewing soon.`;
    } else {
      title = "Subscription Reminder";
      body = `Your ${planName} subscription expires in ${remainingDays} days.`;
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        screen: "Subscription",
        notificationId: notificationId,
        type: "subscription_reminder",
        planName: planName,
        remainingDays: remainingDays.toString(),
        expiryDate: expiryDate.toISOString(),
      },
    };

    const promises = lender.deviceTokens.map((token) => {
      return messaging.send({ ...message, token }).catch((error) => {
        console.error(`Error sending subscription reminder to lender ${token}:`, error);
        if (error.code === 'messaging/invalid-registration-token' || 
            error.code === 'messaging/registration-token-not-registered') {
        }
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Error sending subscription reminder notification:", error);
  }
}

module.exports = { 
  sendLoanStatusNotification, 
  sendLoanUpdateNotification, 
  sendMobileNumberChangeNotification,
  sendFraudAlertNotification,
  sendOverdueLoanNotificationToLender,
  sendOverdueLoanNotificationToBorrower,
  sendPendingPaymentNotificationToLender,
  sendPendingLoanNotificationToLender,
  sendPendingLoanNotificationToBorrower,
  sendSubscriptionReminderNotification
};
