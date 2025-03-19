import { createTransport } from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail email
    pass: process.env.EMAIL_PASS, // Your Gmail app password
  },
});


const sendVerificationEmail = async (user, token) => {
  const verificationUrl = `http://localhost:5000/api/users/verify/${token}`;
  const resendUrl = `http://localhost:5000/api/users/resend-verification?email=${user.email}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "MY SPARES GUY Account Verification",
    html: `<p>Hi ${user.firstName},</p>
           <p>Click the link below to verify your email:</p>
           <a href="${verificationUrl}">Verify Email</a>
           <br><br>
           <p><strong>Note:</strong> This link will expire in 24 hours.</p>
           <p>If the link has expired, click the link below to request a new one:</p>
           <a href="${resendUrl}">Resend Verification Email</a>
           <br><br>
           <p>If you did not request this, please ignore this email.</p>`,
  };

  await transporter.sendMail(mailOptions);
};


export default sendVerificationEmail;
