import Product from "../models/Products.js";

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Private (Admin only)
 */
const createProduct = async (req, res) => {
  try {
    const {
      name,
      image,
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

    const newProduct = new Product({
      name,
      image,
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
      seller: req.user ? req.user._id : null, // Assign seller if user exists
    });

    await newProduct.save();
    res.status(201).json(newProduct);
    console.log(newProduct)
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Fetch all products
 * @route   GET /api/products
 * @access  Private (Logged-in users only)
 */
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find({});
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get a product by ID
 * @route   GET /api/products/:id
 * @access  Private (Logged-in users only)
 */
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * @desc    Update a product
 * @route   PUT /api/products/:id
 * @access  Private (Admin only)
 */
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const {
      name,
      image,
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

    // Update fields
    product.name = name || product.name;
    product.image = image || product.image;
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
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Delete a product
 * @route   DELETE /api/products/:id
 * @access  Private (Admin only)
 */
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await product.deleteOne();
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Export all functions
export { createProduct, getAllProducts, getProductById, updateProduct, deleteProduct };
