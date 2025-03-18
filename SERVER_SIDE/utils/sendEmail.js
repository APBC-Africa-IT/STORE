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

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Verify Your Email MY SPARES GUY",
    html: `<p>Hi ${user.firstName},</p>
           <p>Click the link below to verify your email:</p>
           <a href="${verificationUrl}">Verify Email</a>`,
  };

  await transporter.sendMail(mailOptions);
};

export default sendVerificationEmail;
