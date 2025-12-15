require('dotenv').config();  // Ensure dotenv is loaded at the top

const nodemailer = require('nodemailer');


// Create a transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});


// Function to send a password reset verification email
const sendVerificationEmail = async (to, code) => {
  const mailOptions = {
    from: process.env.EMAIL,
    to: to,
    subject: "Password Reset Verification Code",
    text: `Your verification code is: ${code}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Verification email sent successfully");
  } catch (error) {
    console.error("Error sending verification email:", error);
  }
};

// Function to send a subscription expiry notification email
const sendSubscriptionExpiryEmail = async (userEmail, subscriptionExpiryDate) => {
  const mailOptions = {
    from: process.env.EMAIL,
    to: userEmail,
    subject: "Your Subscription Has Expired",
    text: `Dear User, your subscription expired on ${subscriptionExpiryDate}. Please renew your subscription to continue using the service.`, // Email body
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Subscription expiry notification sent successfully");
  } catch (error) {
    console.error("Error sending subscription expiry email:", error);
  }
};

module.exports = { sendVerificationEmail, sendSubscriptionExpiryEmail };
