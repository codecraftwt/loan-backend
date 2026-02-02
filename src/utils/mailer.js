require('dotenv').config();  // Ensure dotenv is loaded at the top

const nodemailer = require('nodemailer');

// Log email configuration (for debugging)
// console.log("=== Email Configuration ===");
// console.log("EMAIL:", process.env.EMAIL ? `${process.env.EMAIL.substring(0, 5)}...` : "NOT SET");
// console.log("EMAIL_PASSWORD:", process.env.EMAIL_PASSWORD ? "SET (hidden)" : "NOT SET");
// console.log("===========================");

// Create a transporter object using SMTP transport
// Supports: gmail, outlook, yahoo
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail", // gmail, outlook, yahoo
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Verify transporter connection on startup
transporter.verify(function (error, success) {
  if (error) {
    // console.error("=== EMAIL TRANSPORTER ERROR ===");
    console.error("Failed to connect to email server:", error.message);
    // console.error("Full error:", error);
    // console.error("===============================");
  } else {
    console.log("=== EMAIL SERVER READY ===");
    // console.log("Email server is ready to send messages");
    // console.log("==========================");
  }
});

// Function to send a password reset verification email
const sendVerificationEmail = async (to, code) => {
  // console.log(`\n=== Attempting to send email ===`);
  // console.log(`To: ${to}`);
  // console.log(`From: ${process.env.EMAIL}`);
  // console.log(`Code: ${code}`);
  
  const mailOptions = {
    from: process.env.EMAIL,
    to: to,
    subject: "Password Reset Verification Code",
    text: `Your verification code is: ${code}`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    // console.log("=== EMAIL SENT SUCCESSFULLY ===");
    // console.log("Message ID:", info.messageId);
    // console.log("Response:", info.response);
    // console.log("===============================\n");
    return info;
  } catch (error) {
    // console.error("=== EMAIL SEND FAILED ===");
    // console.error("Error name:", error.name);
    // console.error("Error message:", error.message);
    // console.error("Error code:", error.code);
    // console.error("Full error:", error);
    // console.error("=========================\n");
    throw error; // Re-throw so the controller knows email failed
  }
};

module.exports = { sendVerificationEmail };
