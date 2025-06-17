import express from "express";
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import connectDB from "./config/db.js"; // Update path to database config
import userRoutes from "./routes/userRoutes.js"; // Update path to user routes
import productRoutes from "./routes/productRoutes.js"; // Update path to product routes
import cartRoutes from "./routes/cartRoutes.js"; // Update path to cart routes
import passwordResetRoutes from "./routes/passwordResetRoutes.js"; // Update path to reset password routes
import emailverification from "./routes/emailVerificationRoutes.js"
import Account  from "./routes/accountRoutes.js"
import checkout from "./routes/checkoutRoute.js"

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize the express app
const app = express();

// Middleware to parse JSON
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Enable cookie parsing

// Sample route
app.get("/", (req, res) => {
  res.send("API is running...");
});

// Serve static files (uploaded images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? error.message : {}
  });
});

// User routes
app.use("/api/users", userRoutes);

//product routes 
app.use("/api/products", productRoutes);

//cart routes
app.use("/api/cart", cartRoutes);

//password reset routes
app.use("/api/reset", passwordResetRoutes);

//emailVerificationAPI
app.use("/api/email", emailverification);

// accountdeactivation
app.use("/api/softDelete", Account);

//checkout route
app.use("/api/checkout", checkout)

// Start the server
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
