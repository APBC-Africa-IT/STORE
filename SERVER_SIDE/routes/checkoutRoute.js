import express from 'express';
import { checkoutOrder, createDiscountCode  } from "../controllers/checkoutController.js";
import { protectRoute, protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Route to handle checkout process
router.post('/checkoutorder',protectRoute, checkoutOrder);

// only admin can create discount code
router.post('/discount', protectRoute, protectAdmin, createDiscountCode);

export default router;