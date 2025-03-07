import express from "express";
import { addToCart, getCart, removeFromCart } from "../controllers/cartController.js";
import { protect } from "../middleware/cartMiddleware.js";

const router = express.Router();

// Routes for managing the cart
router.post("/", protect, addToCart);
router.get("/", protect, getCart);
router.delete("/:productId", protect, removeFromCart);

export default router;
