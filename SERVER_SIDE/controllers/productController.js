import Product from "../models/Products.js";
import path from 'path';
import fs from 'fs';

/**
 * @desc    Create a new product with image upload
 * @route   POST /api/products
 * @access  Private (Admin only)
 */
const createProduct = async (req, res) => {
  try {
    const {
      name,
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
    } = req.body;

    // Handle image upload
    let imagePath = null;
    if (req.file) {
      // Store relative path for database
      imagePath = `/uploads/products/${req.file.filename}`;
    }

    const newProduct = new Product({
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
      seller: req.user ? req.user._id : null,
    });

    await newProduct.save();
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: newProduct
    });
    console.log('New product created:', newProduct);
  } catch (error) {
    // If there was an error and a file was uploaded, delete it
    if (req.file) {
      const filePath = path.join('uploads/products', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/**
 * @desc    Fetch all products
 * @route   GET /api/products
 * @access  Private (Logged-in users only)
 */
const getAllProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.carMake) filter.carMake = req.query.carMake;
    if (req.query.carModel) filter.carModel = req.query.carModel;
    if (req.query.year) filter.year = req.query.year;
    if (req.query.condition) filter.condition = req.query.condition;

    // Price range filter
    if (req.query.minPrice || req.query.maxPrice) {
      filter.price = {};
      if (req.query.minPrice) filter.price.$gte = parseFloat(req.query.minPrice);
      if (req.query.maxPrice) filter.price.$lte = parseFloat(req.query.maxPrice);
    }

    // Search by name or description
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const products = await Product.find(filter)
      .populate('seller', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Product.countDocuments(filter);

    res.status(200).json({
      success: true,
      products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/**
 * @desc    Get a product by ID
 * @route   GET /api/products/:id
 * @access  Private (Logged-in users only)
 */
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('seller', 'name email');

    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: "Product not found" 
      });
    }

    res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
};

/**
 * @desc    Update a product with optional image upload
 * @route   PUT /api/products/:id
 * @access  Private (Admin only)
 */
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      // If file was uploaded but product not found, delete the file
      if (req.file) {
        const filePath = path.join('uploads/products', req.file.filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      return res.status(404).json({ 
        success: false,
        message: "Product not found" 
      });
    }

    const {
      name,
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
    } = req.body;

    // Handle image update
    if (req.file) {
      // Delete old image if it exists
      if (product.image) {
        const oldImagePath = path.join('.', product.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      // Set new image path
      product.image = `/uploads/products/${req.file.filename}`;
    }

    // Update other fields
    product.name = name || product.name;
    product.price = price || product.price;
    product.description = description || product.description;
    product.category = category || product.category;
    product.carMake = carMake || product.carMake;
    product.carModel = carModel || product.carModel;
    product.year = year || product.year;
    product.condition = condition || product.condition;
    product.transmission = transmission || product.transmission;
    product.fuelType = fuelType || product.fuelType;
    product.stock = stock || product.stock;

    await product.save();
    
    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product
    });
  } catch (error) {
    // If there was an error and a file was uploaded, delete it
    if (req.file) {
      const filePath = path.join('uploads/products', req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/**
 * @desc    Delete a product and its image
 * @route   DELETE /api/products/:id
 * @access  Private (Admin only)
 */
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: "Product not found" 
      });
    }

    // Delete associated image file
    if (product.image) {
      const imagePath = path.join('.', product.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await product.deleteOne();
    
    res.status(200).json({ 
      success: true,
      message: "Product and associated image deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

/**
 * @desc    Upload product image only
 * @route   POST /api/products/upload
 * @access  Private (Admin only)
 */
const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    const imagePath = `/uploads/products/${req.file.filename}`;
    
    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      imagePath: imagePath,
      filename: req.file.filename
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Export all functions
export { 
  createProduct, 
  getAllProducts, 
  getProductById, 
  updateProduct, 
  deleteProduct,
  uploadProductImage
};