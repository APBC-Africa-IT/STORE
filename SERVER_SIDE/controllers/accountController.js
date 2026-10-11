import User from "../models/User.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

/**
 * @desc    Soft-delete (deactivate) own account
 * @route   DELETE /api/softDelete/deactivate/:id
 * @access  Private
 */
const deactivateAccount = async (req, res) => {
  try {
    const { password } = req.body;

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    user.isDeleted = true;
    await user.save();

    res.status(200).json({
      message: "Your account has been deactivated. Contact support if you wish to reactivate.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Reactivate a deactivated account (Admin only)
 * @route   PUT /api/softDelete/reactivate/:id
 * @access  Admin
 */
const reactivateUserAccount = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "User ID is required." });
    }

    if (isNaN(parseInt(id))) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }

    const user = await User.findByPk(parseInt(id));
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.isDeleted) {
      return res.status(400).json({ message: "Account is already active." });
    }

    user.isDeleted = false;
    await user.save();

    res.status(200).json({ message: "User account has been successfully reactivated." });
  } catch (error) {
    console.error("Error reactivating user:", error);
    res.status(500).json({ message: error.message });
  }
};

export { deactivateAccount, reactivateUserAccount };
