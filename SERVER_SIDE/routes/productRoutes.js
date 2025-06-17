import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
 uploadProductImage  
} from "../controllers/productController.js";
import { protectRoute, protectAdmin } from "../middleware/authMiddleware.js";
import { uploadSingle, handleUploadError } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// All routes require the user to be logged in
router.get("/", protectRoute, getAllProducts);
router.get("/:id", protectRoute, getProductById);

// Only Admins can create, update, or delete products
router.post("/", protectRoute, protectAdmin, createProduct);
router.put("/:id", protectRoute, protectAdmin, updateProduct);
router.delete("/:id", protectRoute, protectAdmin, deleteProduct);

 // Image upload only route
router.post('/upload/', protectRoute, protectAdmin, uploadSingle,uploadProductImage );
//handleUploadError, uploadProductImage

export default router;

// // Public routes
// router.get('/', getAllProducts);
// router.get('/:id', getProductById);

// // Protected routes (Admin only)
// router.post('/', protect, admin, uploadSingle, handleUploadError, createProduct);
// router.put('/:id', protect, admin, uploadSingle, handleUploadError, updateProduct);
// router.delete('/:id', protect, admin, deleteProduct);

