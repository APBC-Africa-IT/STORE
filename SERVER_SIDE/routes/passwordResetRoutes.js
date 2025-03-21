import express from "express";
const router = express.Router();

import { requestPasswordReset, resetPassword } from "../controllers/passwordResetController.js";

// Route to send a reset password link via email 
router.post("/reset-password", requestPasswordReset) 

// Route to reset password
router.post("/reset-password/:token", resetPassword)

export default router;