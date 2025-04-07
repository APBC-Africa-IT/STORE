import express from "express";
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

// Initialize the express app
const app = express();

// Middleware to parse JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Enable cookie parsing

// Sample route
app.get("/", (req, res) => {
  res.send("API is running...");
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
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
