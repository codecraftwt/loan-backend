const messaging = require("../config/firebaseConfig");
const User = require("../models/User");

async function sendLoanStatusNotification(userId, loanUser, loanStatus) {
  try {
    // Find the user by userId to get the device tokens
    const user = await User.findById(userId);
    if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
      throw new Error("User or device tokens not found");
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
      });
    });

    // Wait for all notifications to be sent
    await Promise.all(promises);

    console.log(`Loan status notification sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

async function sendLoanUpdateNotification(aadhaarNumber, loan) {
  try {
    const user = await User.findOne({ aadharCardNo: aadhaarNumber });

    if (!user || !user.deviceTokens || user.deviceTokens.length === 0) {
      throw new Error("User or device tokens not found");
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
      });
    });

    // Wait for all notifications to be sent
    await Promise.all(promises);

    console.log(`Loan status notification sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}

module.exports = { sendLoanStatusNotification, sendLoanUpdateNotification };
