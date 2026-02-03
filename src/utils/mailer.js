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

// Sender display name (used with Gmail; optional for Resend)
const MAIL_FROM_NAME = (process.env.MAIL_FROM_NAME || "CodeCraft WT").trim();
// Resend "from": use RESEND_FROM if set, else "Display Name <onboarding@resend.dev>" (Resend cannot use @gmail.com)
const RESEND_FROM = (process.env.RESEND_FROM || "").trim() || `${MAIL_FROM_NAME} <onboarding@resend.dev>`;

// --- Nodemailer (Gmail SMTP) ---
// Prefer Gmail when both Gmail and Resend are set (Gmail delivers more reliably locally).
const gmailConfig = getGmailConfig();
const hasGmail = !!(gmailConfig.email && gmailConfig.password);
const transporter = hasGmail
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
  const html = `
    <p>Your verification code is: <strong>${code}</strong></p>
    <p>This code is valid for a limited time. Do not share it with anyone.</p>
  `.trim();

  // Prefer Gmail when configured — sends from your Gmail (e.g. codecraftwt@gmail.com)
  if (transporter) {
    const fromAddress = gmailConfig.email.includes("@") ? `${MAIL_FROM_NAME} <${gmailConfig.email}>` : gmailConfig.email;
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html,
    });
    return info;
  }

  if (resend) {
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [to],
      subject,
      text,
      html,
    });
    if (error) {
      throw new Error(error.message);
    }
    if (data?.id) {
      console.log("[Resend] Email sent. Id:", data.id, "To:", to);
    }
    return data;
  }

  const { email: cfgEmail, password: cfgPass } = getGmailConfig();
  const missing = [];
  if (!cfgEmail) missing.push("EMAIL");
  if (!cfgPass) missing.push("EMAIL_PASSWORD (or GMAIL_APP_PASSWORD)");
  const err = new Error(
    "Email not configured. In .env add EMAIL + EMAIL_PASSWORD (Gmail) or RESEND_API_KEY. Missing: " +
      missing.join(", ")
  );
  err.code = "EMAIL_NOT_CONFIGURED";
  throw err;
};

module.exports = { sendVerificationEmail };