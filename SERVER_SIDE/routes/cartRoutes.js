import express from "express";
import { addToCart, getCart, updateCartItemQuantity,removeCartItem, deleteCart } from "../controllers/cartController.js";
import { protect } from "../middleware/cartMiddleware.js";

const router = express.Router();

// Routes for managing the cart
router.post("/", protect, addToCart);
router.get("/", protect, getCart);
router.put("/:cartItemId", protect, updateCartItemQuantity);
router.delete("/:cartItemId", protect, removeCartItem);
router.delete("/", protect, deleteCart);

export default router;
