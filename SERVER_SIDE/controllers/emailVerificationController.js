import User from "../models/User.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import crypto from "crypto";
import { sendVerificationEmail } from "../utils/sendEmail.js";

dotenv.config();

/**
 * @desc    Verify user's email via token
 * @route   GET /api/email/verify/:token
 * @access  Public
 */
const verifyUser = async (req, res) => {
  try {
    const { token } = req.params;

    // Find the first unverified user whose token hasn't expired yet.
    // We fetch all unverified users and bcrypt.compare to find the match
    // because bcrypt hashes are not reversible.
    const unverifiedUsers = await User.findAll({ where: { isVerified: false } });

    let matchedUser = null;
    let matchType = null; // 'original' | 'resent'

    for (const u of unverifiedUsers) {
      if (u.verificationToken) {
        const ok = await bcrypt.compare(token, u.verificationToken);
        if (ok) { matchedUser = u; matchType = "original"; break; }
      }
      if (u.resentVerificationToken) {
        const ok = await bcrypt.compare(token, u.resentVerificationToken);
        if (ok) { matchedUser = u; matchType = "resent"; break; }
      }
    }

    if (!matchedUser) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const now = new Date();
    const isExpired =
      matchType === "original"
        ? matchedUser.verificationTokenExpires < now
        : matchedUser.resentVerificationTokenExpires < now;

    if (isExpired) {
      // Auto-regenerate and resend
      const newToken = crypto.randomBytes(32).toString("hex");
      const hashedNewToken = await bcrypt.hash(newToken, 10);

      matchedUser.resentVerificationToken = hashedNewToken;
      matchedUser.resentVerificationTokenExpires = new Date(Date.now() + 5 * 60 * 1000);
      await matchedUser.save();

      await sendVerificationEmail(matchedUser, newToken);

      return res.status(400).json({
        message:
          "Verification token expired. A new verification email has been sent. Please check your inbox.",
      });
    }

    // Token valid — mark as verified and clear all token fields
    matchedUser.isVerified = true;
    matchedUser.verificationToken = null;
    matchedUser.verificationTokenExpires = null;
    matchedUser.resentVerificationToken = null;
    matchedUser.resentVerificationTokenExpires = null;
    await matchedUser.save();

    res.status(200).json({ message: "Email verified successfully. Please proceed to login!" });
  } catch (error) {
    console.error("Error verifying user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * @desc    Resend verification email
 * @route   POST /api/email/resend-verification
 * @access  Public
 */
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User is already verified. You can log in." });
    }

    const newToken = crypto.randomBytes(32).toString("hex");
    const hashedNewToken = await bcrypt.hash(newToken, 10);

    user.resentVerificationToken = hashedNewToken;
    user.resentVerificationTokenExpires = new Date(Date.now() + 1 * 60 * 1000); // 1 min
    await user.save();

    const verificationLink = `http://localhost:5000/api/email/verify/${newToken}`;
    await sendVerificationEmail(user, verificationLink);

    res.status(200).json({
      message: "A new verification email has been sent. Please check your inbox.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { verifyUser, resendVerificationEmail };
