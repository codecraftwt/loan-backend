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
  let password =
    process.env.EMAIL_PASSWORD ||
    process.env.MAIL_PASSWORD ||
    process.env.GMAIL_APP_PASSWORD ||
    process.env.GMAIL_PASSWORD ||
    process.env.EMAIL_APP_PASSWORD;
  
  // Gmail App Passwords work with or without spaces - normalize by removing extra spaces
  // but keeping the format Gmail expects (16 chars, can have spaces)
  password = (password || "").trim();
  
  return { email: (email || "").trim(), password };
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

// Log email configuration status (without exposing credentials)
console.log("[Mailer] Gmail configured:", hasGmail);
console.log("[Mailer] Gmail email:", gmailConfig.email ? gmailConfig.email.substring(0, 5) + "***" : "NOT SET");
console.log("[Mailer] Gmail password length:", gmailConfig.password ? gmailConfig.password.length : 0);
console.log("[Mailer] Resend configured:", !!resend);

const transporter = hasGmail
  ? nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: gmailConfig.email,
        pass: gmailConfig.password,
      },
      secure: true,
      // Add timeout settings for cloud environments
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;

if (transporter) {
  transporter.verify(function (error, success) {
    if (error) {
      console.error("[Mailer] Gmail SMTP verification FAILED:", error.message);
      console.error("[Mailer] Error code:", error.code);
    } else {
      console.log("[Mailer] Gmail SMTP server is ready to send emails");
    }
  });
}

const sendVerificationEmail = async (to, code) => {
  const subject = "Password Reset Verification Code";
  const text = `Your verification code is: ${code}. This code is valid for a limited time.`;
  const html = `
    <p>Your verification code is: <strong>${code}</strong></p>
    <p>This code is valid for a limited time. Do not share it with anyone.</p>
  `.trim();

  console.log("[Mailer] Attempting to send email to:", to);

  // Prefer Gmail when configured — sends from your Gmail (e.g. codecraftwt@gmail.com)
  if (transporter) {
    const fromAddress = gmailConfig.email.includes("@") ? `${MAIL_FROM_NAME} <${gmailConfig.email}>` : gmailConfig.email;
    console.log("[Mailer] Using Gmail SMTP, from:", fromAddress);
    
    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text,
        html,
      });
      console.log("[Mailer] Gmail email sent successfully. MessageId:", info.messageId);
      return info;
    } catch (gmailError) {
      console.error("[Mailer] Gmail SMTP Error:", gmailError.message);
      console.error("[Mailer] Gmail Error Code:", gmailError.code);
      console.error("[Mailer] Gmail Error Response:", gmailError.response);
      
      // If Gmail fails and Resend is available, fallback to Resend
      if (resend) {
        console.log("[Mailer] Gmail failed, falling back to Resend...");
      } else {
        throw gmailError;
      }
    }
  }

  if (resend) {
    console.log("[Mailer] Using Resend API, from:", RESEND_FROM);
    
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM,
      to: [to],
      subject,
      text,
      html,
    });
    if (error) {
      console.error("[Mailer] Resend Error:", error);
      throw new Error(error.message);
    }
    if (data?.id) {
      console.log("[Resend] Email sent successfully. Id:", data.id, "To:", to);
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