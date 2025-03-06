import express from "express";
const router = express.Router();
import { registerUser, getAllUsers, loginUser } from "../controllers/userController.js";
import { protectRoute, protectAdmin } from "../middleware/authMiddleware.js";
// Route for user registration
router.post("/register", registerUser);

// Route for user login
router.post("/login", loginUser);

// Route to get all users (protected - example of admin functionality)
// You can later add middleware to check if the user is admin
//Only logged-in users can access it
router.get("/", protectRoute, protectAdmin, getAllUsers);

export default router;
