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
    verificationToken: {
      type: String // Token to verify email
    },   
    verificationTokenExpires: {
      type: Date, // Stores the expiration time of the token
    } 
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields
  }
);

const User = mongoose.model("User", userSchema);

export default User;
