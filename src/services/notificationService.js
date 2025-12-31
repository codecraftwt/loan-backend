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

module.exports = { 
  sendLoanStatusNotification, 
  sendLoanUpdateNotification, 
  sendMobileNumberChangeNotification,
  sendFraudAlertNotification 
};
