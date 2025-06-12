import User from "../models/User.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto"// Used to generate a random token
import {sendVerificationEmail} from "../utils/sendEmail.js";

dotenv.config();

/**
 * @desc    Verify user's email
 * @route   GET /api/users/verify/:token
 * @access  Public
 */
// const verifyUser = async (req, res) => {
//   try {
//     const { token } = req.params;

//     // Verify token
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findOne({ email: decoded.email });

//     if (!user) {
//       return res.status(400).json({ message: "Invalid or expired token" });
//     }

//     // Mark user as verified
//     user.isVerified = true;
//     user.verificationToken = null; // Remove token after verification
//     await user.save();

//     res.status(200).json({ message: "Email verified successfully. You can now log in." });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

const verifyUser = async (req, res) => {
    try {
      const { token } = req.params;
  
      // Find the first unverified user
      const user = await User.findOne({ isVerified: false });
  
      if (!user) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
  
      // Check if the token matches the original or resent token
      const isOriginalTokenValid = user.verificationToken && (await bcrypt.compare(token, user.verificationToken));
      const isResentTokenValid = user.resentVerificationToken && (await bcrypt.compare(token, user.resentVerificationToken));
  
      if (!isOriginalTokenValid && !isResentTokenValid) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
  
      // Check expiration
      if (
        (isOriginalTokenValid && user.verificationTokenExpires < new Date()) ||
        (isResentTokenValid && user.resentVerificationTokenExpires < new Date())
      ) {
        // Generate a new token if expired
        const newToken = crypto.randomBytes(32).toString("hex");
        const hashedNewToken = await bcrypt.hash(newToken, 10);
  
        // Update only the resent token fields
        user.resentVerificationToken = hashedNewToken;
        user.resentVerificationTokenExpires = new Date(Date.now() + 5 * 60 * 1000); // 1 min expiry
  
        await user.save();
  
        // Resend the verification email
        await sendVerificationEmail(user, newToken);
  
        return res.status(400).json({
          message: "Verification token expired. A new verification email has been sent. Please check your inbox."
        });
      }
  
      // Token is valid → Verify user
      user.isVerified = true;
      user.verificationToken = null;
      user.verificationTokenExpires = null;
      user.resentVerificationToken = null;
      user.resentVerificationTokenExpires = null;
  
      await user.save();
  
      res.status(200).json({ message: "Email verified successfully. Please proceed to login!" });
    } catch (error) {
      console.error("Error verifying user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };
  
  /**
   * resend verification email
   * POST /api/users/resend-verification
   * public
   */
  
  const resendVerificationEmail = async (req, res) => {
    try {
      const { email } = req.body;
  
      // Find the user
      const user = await User.findOne({ email });
  
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // If the user is already verified, return an error
      if (user.isVerified) {
        return res.status(400).json({ message: "User is already verified. You can log in." });
      }
  
      // Generate a new token
      const newToken = crypto.randomBytes(32).toString("hex");
      const hashedNewToken = await bcrypt.hash(newToken, 10); // Hash before storing
  
      // Update the user record with resent verification token
      user.resentVerificationToken = hashedNewToken;
      user.resentVerificationTokenExpires = new Date(Date.now() + 1 * 60 * 1000); // 1 min expiry (change as needed)
  
      await user.save();
  
      // Send the new verification email
      const verificationLink = `http://localhost:5000/api/users/verify/${newToken}`;
      await sendVerificationEmail(user, verificationLink);
  
      res.status(200).json({ message: "A new verification email has been sent. Please check your inbox." });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

  export { verifyUser, resendVerificationEmail }