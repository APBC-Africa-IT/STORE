import User from "../models/User.js";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import crypto from "crypto"// Used to generate a random token
import {sendVerificationEmail} from "../utils/sendEmail.js";

dotenv.config();

/**
 * @desc    Register a new user
 * @route   POST /api/users/register
 * @access  Public
 */
const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate verification token
    // const verificationToken = jwt.sign({ email }, process.env.JWT_SECRET, {
    //   expiresIn: "1d",
    // });

    // Generate a random token for email verification
    const verificationToken = crypto.randomBytes(32).toString("hex");

    // Hash the verification token before saving
    const hashedToken = await bcrypt.hash(verificationToken, 10);

    // Set expiration time to 24 hours from now
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + 1);

    // Create user (unverified)
    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      isVerified: false,
      verificationTokenExpires: expirationTime, // Store expiration time
      verificationToken: hashedToken
    });

    await user.save();

    // Send verification email
    await sendVerificationEmail(user, verificationToken);

    res.status(201).json({ message: "User registered. Check email for verification link." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};






/**
 * @desc    Login user & get token
 * @route   POST /api/users/login
 * @access  Public
 */
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check if the account is deactivated
    if (user.isDeleted) {
      return res.status(403).json({
        message: "Your account has been deactivated. Contact support if you wish to reactivate.",
      });
    }

    // Check if user is verified
    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your email before logging in." });
    }

    // Check if password matches
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, isAdmin: user.isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.cookie("jwt", token, {
      httpOnly: true, // Prevents access via JavaScript (security against XSS)
      // secure: process.env.NODE_ENV === "production", // HTTPS-only in production
      sameSite: "strict", // Prevents CSRF attacks
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(200).json({
      message: "Login successful, token stored in cookie",
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      isAdmin: user.isAdmin,
      token,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * @desc    make user an Admin(Admin only)
 * @route   PUT /api/users/:id
 * @access  Admin
 */



const makeAdmin = async (req, res) => {
  try {
    // Check if the logged-in user is an admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ message: "Access denied. Admins only." });
    }

    const { id } = req.params;
    // console.log("userId:", id); // Log the incoming ID
    // console.log("Is valid ObjectId:", mongoose.Types.ObjectId.isValid(id)); // Check validity

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID format" });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isAdmin = true;
    await user.save();

    res.status(200).json({ message: "User promoted to admin", user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * @desc    Fetch all users (Admin only)
 * @route   GET /api/users
 * @access  Admin
 */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({});
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (only logged-in users)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password"); // Exclude password

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

const logoutUser = (req, res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0), // Expire the cookie immediately
  });

  res.status(200).json({ message: "Logged out successfully" });
};


// Export functions at the end
export { registerUser, getAllUsers, loginUser, logoutUser, getUserById, makeAdmin };
