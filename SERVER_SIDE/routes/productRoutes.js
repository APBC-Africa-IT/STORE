import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";
import { protectRoute, protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes require the user to be logged in
router.get("/", protectRoute, getAllProducts);
router.get("/:id", protectRoute, getProductById);

// Only Admins can create, update, or delete products
router.post("/", protectRoute, protectAdmin, createProduct);
router.put("/:id", protectRoute, protectAdmin, updateProduct);
router.delete("/:id", protectRoute, protectAdmin, deleteProduct);

export default router;
