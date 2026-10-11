import { Op } from "sequelize";
import Product from "../models/Products.js";
import User from "../models/User.js";
import path from "path";
import fs from "fs";

/**
 * @desc    Create a new product with optional image upload
 * @route   POST /api/products
 * @access  Private (Admin only)
 */
const createProduct = async (req, res) => {
  try {
    const {
      name, price, description, category,
      carMake, carModel, year, condition,
      transmission, fuelType, stock,
    } = req.body;

    let imagePath = null;
    if (req.file) {
      imagePath = `/uploads/products/${req.file.filename}`;
    }

    const newProduct = await Product.create({
      name,
      image: imagePath,
      price,
      description,
      category,
      carMake,
      carModel,
      year,
      condition,
      transmission,
      fuelType,
      stock,
      sellerId: req.user ? req.user.id : null,
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product: newProduct,
    });
  } catch (error) {
    // Remove the uploaded file if the DB write failed
    if (req.file) {
      const filePath = path.join("uploads/products", req.file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Fetch all products with filtering, search and pagination
 * @route   GET /api/products
 * @access  Private (Logged-in users only)
 */
const getAllProducts = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Build Sequelize where clause
    const where = {};

    if (req.query.category)  where.category  = req.query.category;
    if (req.query.carMake)   where.carMake   = req.query.carMake;
    if (req.query.carModel)  where.carModel  = req.query.carModel;
    if (req.query.year)      where.year      = req.query.year;
    if (req.query.condition) where.condition = req.query.condition;

    // Price range
    if (req.query.minPrice || req.query.maxPrice) {
      where.price = {};
      if (req.query.minPrice) where.price[Op.gte] = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) where.price[Op.lte] = parseFloat(req.query.maxPrice);
    }

    // Full-text search on name and description (case-insensitive)
    if (req.query.search) {
      const term = `%${req.query.search}%`;
      where[Op.or] = [
        { name:        { [Op.iLike]: term } },
        { description: { [Op.iLike]: term } },
      ];
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "firstName", "lastName", "email"],
        },
      ],
      order:  [["createdAt", "DESC"]],
      offset,
      limit,
    });

    res.status(200).json({
      success: true,
      products,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get a single product by ID
 * @route   GET /api/products/:id
 * @access  Private (Logged-in users only)
 */
const getProductById = async (req, res) => {
  try {
    const product = await Product.findByPk(parseInt(req.params.id), {
      include: [
        {
          model: User,
          as: "seller",
          attributes: ["id", "firstName", "lastName", "email"],
        },
      ],
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * @desc    Update a product with optional image upload
 * @route   PUT /api/products/:id
 * @access  Private (Admin only)
 */
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(parseInt(req.params.id));

    if (!product) {
      if (req.file) {
        const filePath = path.join("uploads/products", req.file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const {
      name, price, description, category,
      carMake, carModel, year, condition,
      transmission, fuelType, stock,
    } = req.body;

    // Replace image file if a new one was uploaded
    if (req.file) {
      if (product.image) {
        const oldImagePath = path.join(".", product.image);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
      product.image = `/uploads/products/${req.file.filename}`;
    }

    product.name         = name         ?? product.name;
    product.price        = price        ?? product.price;
    product.description  = description  ?? product.description;
    product.category     = category     ?? product.category;
    product.carMake      = carMake      ?? product.carMake;
    product.carModel     = carModel     ?? product.carModel;
    product.year         = year         ?? product.year;
    product.condition    = condition    ?? product.condition;
    product.transmission = transmission ?? product.transmission;
    product.fuelType     = fuelType     ?? product.fuelType;
    product.stock        = stock        ?? product.stock;

    await product.save();

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    if (req.file) {
      const filePath = path.join("uploads/products", req.file.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Delete a product and its associated image
 * @route   DELETE /api/products/:id
 * @access  Private (Admin only)
 */
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(parseInt(req.params.id));

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.image) {
      const imagePath = path.join(".", product.image);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }

    await product.destroy();

    res.status(200).json({
      success: true,
      message: "Product and associated image deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Upload a product image only (no product record created)
 * @route   POST /api/products/upload
 * @access  Private (Admin only)
 */
const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    const imagePath = `/uploads/products/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      imagePath,
      filename: req.file.filename,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  uploadProductImage,
};
