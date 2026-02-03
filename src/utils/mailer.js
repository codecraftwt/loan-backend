const path = require("path");
// Load .env from project root (same folder as package.json)
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const nodemailer = require("nodemailer");

// Gmail: read from .env (support multiple common variable names)
const getGmailConfig = () => {
  const email =
    process.env.EMAIL ||
    process.env.GMAIL_EMAIL ||
    process.env.GMAIL_USER;
  const password =
    process.env.EMAIL_PASSWORD ||
    process.env.MAIL_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.GMAIL_PASSWORD ||
    process.env.EMAIL_APP_PASSWORD;
  return { email: (email || "").trim(), password: (password || "").trim() };
};

// --- Resend (FREE: 3000 emails/month, no Gmail needed) ---
let Resend;
if (process.env.RESEND_API_KEY) {
  Resend = require("resend").Resend;
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Resend free sender (no domain verification needed)
const RESEND_FROM = "Loan App <onboarding@resend.dev>";

// --- Nodemailer (Gmail SMTP) ---
// .env: EMAIL (or GMAIL_EMAIL) and EMAIL_PASSWORD (or GMAIL_APP_PASSWORD). Use Gmail App Password.
const gmailConfig = getGmailConfig();
const transporter =
  !resend && gmailConfig.email && gmailConfig.password
    ? nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: {
          user: gmailConfig.email,
          pass: gmailConfig.password,
        },
        secure: true,
      })
    : null;

if (transporter) {
  transporter.verify(function () {});
}

const sendVerificationEmail = async (to, code) => {
  const subject = "Password Reset Verification Code";
  const text = `Your verification code is: ${code}. This code is valid for a limited time.`;

  // Prefer Resend (free, no Gmail/App Password)
  if (resend) {
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [to],
      subject,
      text,
    });
    if (error) {
      // console.error("Resend send failed:", error.message);
      throw new Error(error.message);
    }
    return data;
  }

  // Fallback: Gmail via Nodemailer
  if (!transporter) {
    const { email: cfgEmail, password: cfgPass } = getGmailConfig();
    const missing = [];
    if (!cfgEmail) missing.push("EMAIL");
    if (!cfgPass) missing.push("EMAIL_PASSWORD (or GMAIL_APP_PASSWORD)");
    const err = new Error(
      "Email not configured. In .env (project root) add exactly: EMAIL=your@gmail.com and EMAIL_PASSWORD=your16charapppassword (no spaces around =). Missing: " +
        missing.join(", ")
    );
    err.code = "EMAIL_NOT_CONFIGURED";
    throw err;
  }

  const info = await transporter.sendMail({
    from: gmailConfig.email,
    to,
    subject,
    text,
  });
  return info;
};

module.exports = { sendVerificationEmail };