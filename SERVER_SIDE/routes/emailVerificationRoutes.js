import express from "express";
const router = express.Router();

import { verifyUser, resendVerificationEmail} from "../controllers/emailVerificationController.js"

// //Email verification
router.get("/verify/:token", verifyUser);

// //Resend verification Email
router.post("/resend-verification", resendVerificationEmail )

export default router