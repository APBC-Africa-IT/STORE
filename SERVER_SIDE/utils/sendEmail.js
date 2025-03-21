import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// Create a reusable transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends an email.
 * @param {string} to - Recipient email.
 * @param {string} subject - Email subject.
 * @param {string} html - Email body (HTML format).
 */
const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

/**
 * Sends an account verification email.
 * @param {Object} user - User object containing email and firstName.
 * @param {string} token - Verification token.
 */
export const sendVerificationEmail = async (user, token) => {
  const verificationUrl = `http://localhost:5000/api/email/verify/${token}`;
  const resendUrl = `http://localhost:5000/api/email/resend-verification?email=${user.email}`;

  const html = `<p>Hi ${user.firstName},</p>
                <p>Click the link below to verify your email:</p>
                <a href="${verificationUrl}">Verify Email</a>
                <br><br>
                <p><strong>Note:</strong> This link will expire in 24 hours.</p>
                <p>If the link has expired, click the link below to request a new one:</p>
                <a href="${resendUrl}">Resend Verification Email</a>
                <br><br>
                <p>If you did not request this, please ignore this email.</p>`;

  await sendEmail(user.email, "MY SPARES GUY Account Verification", html);
};

/**
 * Sends a password reset email.
 * @param {string} email - User's email.
 * @param {string} resetLink - Reset password link.
 */
export const sendResetPasswordEmail = async (email, resetLink) => {
  const html = `<p>Click the link below to reset your password:</p>
                <a href="${resetLink}">${resetLink}</a>
                <p>This link expires in 1 hour.</p>`;

  await sendEmail(email, "MY SPARES GUY Password Reset Request", html);
};
