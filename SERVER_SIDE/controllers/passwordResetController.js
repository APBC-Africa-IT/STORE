import User from "../models/User.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto"// Used to generate a random token
import {sendResetPasswordEmail} from "../utils/sendEmail.js";


dotenv.config();

/**
 * @desc    Request password reset
 * @route   POST /api/users/reset-password
 * @access  Public
 */
const requestPasswordReset = async (req, res) => {
    try {
      const { email } = req.body;
  
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // Generate a random reset token
      const resetToken = crypto.randomBytes(32).toString("hex");
  
      // Hash the token before saving it
      const hashedToken = await bcrypt.hash(resetToken, 10);
  
      // Set token expiry (1 hour from now)
      const expirationTime = new Date(Date.now() + 60 * 60 * 1000);
  
      user.resetPasswordToken = hashedToken;
      user.resetPasswordExpires = expirationTime;
      await user.save();
  
      // Send reset email
      const resetLink = `http://localhost:5000/api/reset/reset-password/${resetToken}`;
      await sendResetPasswordEmail(user.email, resetLink);
  
      res.status(200).json({ message: "Password reset email sent. Check your inbox." });
  
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
  
  /**
   * @desc    Reset password
   * @route   POST /api/users/reset-password/:token
   * @access  Public
   */
  const resetPassword = async (req, res) => {
    try {
      const { token } = req.params;
      const { newPassword } = req.body;
  
      // Find user with a valid token
      const user = await User.findOne({ resetPasswordExpires: { $gt: new Date() } });
  
      if (!user || !user.resetPasswordToken) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
  
      // Check if token is valid
      const isTokenValid = await bcrypt.compare(token, user.resetPasswordToken);
      if (!isTokenValid) {
        return res.status(400).json({ message: "Invalid or expired token" });
      }
  
      // Hash new password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
  
      // Clear reset fields
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
  
      await user.save();
  
      res.status(200).json({ message: "Password reset successful. You can now log in." });
  
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

  export { requestPasswordReset, resetPassword };