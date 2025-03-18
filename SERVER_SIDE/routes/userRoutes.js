import express from "express";
const router = express.Router();
import { registerUser, getAllUsers, loginUser, verifyUser, logoutUser, getUserById, makeAdmin } from "../controllers/userController.js";
import { protectRoute, protectAdmin } from "../middleware/authMiddleware.js";
// Route for user registration
router.post("/register", registerUser);

// Route for user login
router.post("/login", loginUser);

//Email verification
router.get("/verify/:token", verifyUser);

//make user an admin
router.put("/makeAdmin/:id", protectRoute, protectAdmin,makeAdmin);

// Route for user logout
router.post("/logout", logoutUser);

// Route to get all users (protected - example of admin functionality)
// You can later add middleware to check if the user is admin
//Only logged-in users can access it
router.get("/", protectRoute, protectAdmin, getAllUsers);

// Route to get user by ID
// Only logged-in users can access it
router.get("/:id", protectRoute, protectAdmin, getUserById);

export default router;
