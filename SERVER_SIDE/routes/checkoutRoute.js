import express from 'express';
import { checkoutOrder } from "../controllers/checkoutController.js";
import { protectRoute,  } from "../middleware/authMiddleware.js";

const router = express.Router();

// Route to handle checkout process
router.post('/checkoutorder',protectRoute, checkoutOrder);

export default router;