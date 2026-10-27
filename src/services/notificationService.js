const messaging = require("../config/firebaseConfig");
const User = require("../models/User");
const Notification = require("../models/Notification");

/**
 * Persist notification to MongoDB for in-app notification inbox & bell
 */
async function saveInAppNotification({ userId, title, message, type = "info", metadata = {} }) {
  try {
    if (userId) {
      await Notification.create({
        userId,
        title,
        message,
        type,
        metadata,
        isRead: false,
      });
    }
  } catch (err) {
    console.error("Error saving in-app notification:", err.message);
  }
}

/**
 * Send real-time push notification to user device tokens
 */
async function sendPushToUser(userId, title, body, data = {}) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
      return;
    }

    // Convert all data values to strings (FCM requirement)
    const sanitizedData = {};
    if (data && typeof data === "object") {
      Object.keys(data).forEach((key) => {
        const val = data[key];
        if (val !== undefined && val !== null) {
          sanitizedData[key] = typeof val === "object" ? JSON.stringify(val) : String(val);
        }
      });
    }

    const notificationId = `${user.userName || "user"}_${Date.now()}`;
    const message = {
      notification: { title, body },
      data: {
        ...sanitizedData,
        title,
        message: body,
        notificationId,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "loan_notifications",
          sound: "default",
          priority: "high",
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
    };

    const staleTokens = [];
    const promises = user.deviceTokens.map((token) =>
      messaging.send({ ...message, token }).catch(async (err) => {
        console.error(`Error sending push to token ${token}:`, err.message);
        if (
          err.code === "messaging/invalid-registration-token" ||
          err.code === "messaging/registration-token-not-registered"
        ) {
          staleTokens.push(token);
        }
      })
    );

    await Promise.all(promises);

    // Clean up invalid or uninstalled tokens
    if (staleTokens.length > 0) {
      await User.findByIdAndUpdate(userId, {
        $pull: { deviceTokens: { $in: staleTokens } },
      }).catch((e) => console.error("Error cleaning stale tokens:", e.message));
    }
  } catch (err) {
    console.error("Error in sendPushToUser:", err.message);
  }
}

async function sendLoanStatusNotification(userId, loanUser, loanStatus) {
  try {
    const title = "Loan Status Update";
    const body = `The loan has been ${loanStatus} by ${loanUser}`;
    const type = loanStatus === "approved" || loanStatus === "accepted" ? "loan_accepted" : loanStatus === "rejected" ? "loan_rejected" : "info";

    await saveInAppNotification({
      userId,
      title,
      message: body,
      type,
      metadata: { loanStatus, loanUser },
    });

    await sendPushToUser(userId, title, body, {
      type,
      loanStatus,
      loanUser,
      screen: "Notifications",
    });
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

async function sendLoanUpdateNotification(aadhaarNumber, loan) {
  try {
    const user = await User.findOne({ aadharCardNo: aadhaarNumber });
    if (!user) return;

    const title = "Loan Update";
    const body = "Your loan has been processed and the details have been updated.";

    await saveInAppNotification({
      userId: user._id,
      title,
      message: body,
      type: "info",
      metadata: { loanId: loan?._id },
    });

    await sendPushToUser(user._id, title, body, {
      type: "info",
      loanId: loan?._id ? loan._id.toString() : "",
      screen: "Notifications",
    });
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

async function sendMobileNumberChangeNotification(lenderId, borrowerName, oldMobileNo, newMobileNo) {
  try {
    await saveInAppNotification({
      userId: lenderId,
      title: "Borrower Mobile Number Changed",
      message: `${borrowerName} changed the mobile number from ${oldMobileNo} to ${newMobileNo}`,
      type: "info",
    });

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

    // Save in-app notification
    await saveInAppNotification({
      userId: lenderId,
      title,
      message: body,
      type: "info",
      metadata: { loanId },
    });

    // Find the lender by lenderId to get the device tokens
    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

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
    const overdueDays = loan.overdueDetails?.overdueDays || 0;
    const overdueAmount = loan.overdueDetails?.overdueAmount || loan.remainingAmount || 0;
    const body = `Loan from ${borrowerName} is overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}. Amount: ₹${overdueAmount}`;

    await saveInAppNotification({
      userId: lenderId,
      title: "Overdue Loan Alert",
      message: body,
      type: "info",
      metadata: { loanId: loan._id },
    });

    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_overdue_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    const message = {
      notification: {
        title: "Overdue Loan Alert",
        body,
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
    if (!borrower) return;

    const overdueDays = loan.overdueDetails?.overdueDays || 0;
    const overdueAmount = loan.overdueDetails?.overdueAmount || loan.remainingAmount || 0;
    const title = "Loan Overdue Reminder";
    const body = `Your loan to ${lenderName} is overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}. Please pay ₹${overdueAmount} to avoid further issues.`;

    await saveInAppNotification({
      userId: borrower._id,
      title,
      message: body,
      type: "overdue_loan",
      metadata: { loanId: loan._id, overdueDays, overdueAmount },
    });

    await sendPushToUser(borrower._id, title, body, {
      type: "overdue_loan",
      loanId: loan._id ? loan._id.toString() : "",
      lenderName: lenderName || "",
      overdueDays: overdueDays.toString(),
      overdueAmount: overdueAmount.toString(),
      screen: "Notifications",
    });
  } catch (error) {
    console.error("Error sending overdue loan notification to borrower:", error);
  }
}

// Send pending payment notification to lender
async function sendPendingPaymentNotificationToLender(lenderId, loan, borrowerName, paymentAmount, paymentMode) {
  try {
    const paymentModeText = paymentMode === "online" ? "online (Razorpay)" : "cash";
    const body = `${borrowerName} has submitted a payment of ₹${paymentAmount} via ${paymentModeText}. Please confirm or reject.`;

    await saveInAppNotification({
      userId: lenderId,
      title: "Pending Payment Request",
      message: body,
      type: "loan_payment_confirmed",
      metadata: { loanId: loan._id, amount: paymentAmount },
    });

    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_pending_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    const message = {
      notification: {
        title: "Pending Payment Request",
        body,
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
    const body = `Loan of ₹${loan.amount} to ${borrowerName} is waiting for borrower acceptance.`;

    await saveInAppNotification({
      userId: lenderId,
      title: "Pending Loan Acceptance",
      message: body,
      type: "info",
      metadata: { loanId: loan._id, amount: loan.amount },
    });

    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
    }

    const notificationId = `${lender.userName}_pending_loan_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

    const message = {
      notification: {
        title: "Pending Loan Acceptance",
        body,
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
    if (!borrower) return;

    const title = "New Loan Offer";
    const body = `${lenderName} has offered you a loan of ₹${loan.amount}. Please review and accept.`;

    await saveInAppNotification({
      userId: borrower._id,
      title,
      message: body,
      type: "loan_accepted",
      metadata: { loanId: loan._id, amount: loan.amount },
    });

    await sendPushToUser(borrower._id, title, body, {
      type: "pending_loan",
      loanId: loan._id ? loan._id.toString() : "",
      lenderName: lenderName || "",
      loanAmount: loan.amount ? loan.amount.toString() : "",
      screen: "Notifications",
    });
  } catch (error) {
    console.error("Error sending pending loan notification to borrower:", error);
  }
}

// Send subscription reminder notification to lender
async function sendSubscriptionReminderNotification(lenderId, planName, remainingDays, expiryDate) {
  try {
    const notificationId = `subscription_${Date.now().toString()}_${Math.random().toString(36).substring(2, 10)}`;

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

    await saveInAppNotification({
      userId: lenderId,
      title,
      message: body,
      type: "info",
    });

    const lender = await User.findById(lenderId);
    if (!lender || !lender.deviceTokens || lender.deviceTokens.length === 0) {
      return;
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
        expiryDate: expiryDate ? expiryDate.toISOString() : new Date().toISOString(),
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
  sendSubscriptionReminderNotification,
  sendPushToUser,
  saveInAppNotification,
};

