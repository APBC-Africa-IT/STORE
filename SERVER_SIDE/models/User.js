import mongoose from "mongoose";

const userSchema = mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    isAdmin: {
      type: Boolean,
      default: false, // Indicates admin or customer
    },

    isVerified: {
      type: Boolean,
      default: false, // Indicates if user has verified email
    },

    // First verification token (initial registration)
    verificationToken: {
      type: String // Token to verify email
    },

    verificationTokenExpires: {
      type: Date, // Stores the expiration time of the token
    },

    // Resent verification token (if user requests a new email)
    resentVerificationToken: {
      type: String // Token to verify email
    },

    resentVerificationTokenExpires: {
      type: Date, // Stores the expiration time of the token
    },
    //password reset token
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false, // Indicates if user has been deleted
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

const User = mongoose.model("User", userSchema);

export default User;
