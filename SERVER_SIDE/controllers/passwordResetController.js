import User from "../models/User.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import crypto from "crypto";
import { Op } from "sequelize";
import { sendResetPasswordEmail } from "../utils/sendEmail.js";

dotenv.config();

/**
 * @desc    Request password reset — sends email with reset link
 * @route   POST /api/reset/request-reset
 * @access  Public
 */
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate a random reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcrypt.hash(resetToken, 10);

    // Expires in 1 hour
    const expirationTime = new Date(Date.now() + 1 * 60 * 60 * 1000);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = expirationTime;
    await user.save();

    const resetLink = `http://localhost:5002/api/reset/reset-password/${resetToken}`;
    await sendResetPasswordEmail(user.email, resetLink);

    res.status(200).json({ message: "Password reset email sent. Check your inbox." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Reset password using the token from the email link
 * @route   POST /api/reset/reset-password/:token
 * @access  Public
 */
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;

    // Find users whose reset token hasn't expired
    // We can't query by the hashed token directly, so we fetch all
    // candidates with a still-valid expiry and compare.
    const candidates = await User.findAll({
      where: {
        resetPasswordExpires: { [Op.gt]: new Date() },
        resetPasswordToken: { [Op.ne]: null },
      },
    });

    let matchedUser = null;
    for (const u of candidates) {
      const valid = await bcrypt.compare(token, u.resetPasswordToken);
      if (valid) { matchedUser = u; break; }
    }

    if (!matchedUser) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const salt = await bcrypt.genSalt(10);
    matchedUser.password = await bcrypt.hash(newPassword, salt);
    matchedUser.resetPasswordToken = null;
    matchedUser.resetPasswordExpires = null;
    await matchedUser.save();

    res.status(200).json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { requestPasswordReset, resetPassword };
