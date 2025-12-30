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
  } catch (error) {
    console.error("Error sending verification email:", error);
  }
};

module.exports = { sendVerificationEmail };
