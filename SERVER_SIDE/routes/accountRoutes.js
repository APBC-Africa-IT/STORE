import express from "express";
const router = express.Router();
import { deactivateAccount, reactivateUserAccount } from "../controllers/accountController.js";
import { protectRoute, protectAdmin } from "../middleware/authMiddleware.js";

// Route for soft deleting account

router.delete("/deactivate", protectRoute, deactivateAccount);

// Route for reactivating account
router.put("/reactivate/:id", protectRoute, protectAdmin, reactivateUserAccount);

export default router;