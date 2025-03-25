import User from "../models/User.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

// Soft Delete Implementation (Marking as Deactivated)
// Instead of deleting the user record, we'll:

// Add a isDeleted field to mark the account as deactivated.
// Prevent deactivated users from logging in.
// Provide a way to restore the account if needed.

/**
 * desc softdelete account
 * route DELETE /api/softDelete/deactivate/:id
 * access public
 */

const deactivateAccount = async (req, res) => {
  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify password (Compare input with hashed password)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    // Mark account as deactivated instead of deleting
    user.isDeleted = true;
    await user.save();

    res.status(200).json({ message: "Your account has been deactivated. Contact support if you wish to reactivate." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * desc reactivating account
 * route PUT /api/softDelete/reactivate/:id
 * access private
 */

const reactivateUserAccount = async (req, res) => {
    try {
       
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ message: "User ID is required." });
        }

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid user ID format." });
            
        }

        const user = await User.findById(id);
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

export {deactivateAccount, reactivateUserAccount}