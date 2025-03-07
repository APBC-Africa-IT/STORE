import Cart from "../models/cartModel.js";
import Product from "../models/Products.js";

/**
 * @desc    Add a product to the cart
 * @route   POST /api/cart
 * @access  Private (User)
 */
const addToCart = async (req, res) => {
  try {

    // Debugging log to check if req.user._id exists
    console.log("Authenticated User ID:", req.user?._id)
    const { productId, quantity } = req.body;

    // Find the product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find user's cart
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      // If cart doesn't exist, create a new one
      cart = new Cart({ user: req.user._id, cartItems: [] });
    }

    // Check if the product already exists in the cart
    const existingItem = cart.cartItems.find(
      (item) => item.product.toString() === productId
    );

    if (existingItem) {
      // Update quantity if product already exists in cart
      existingItem.quantity += quantity;
    } else {
      // Add new item to the cart
      cart.cartItems.push({
        product: product._id,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity,
      });
    }

    await cart.save();
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get user's cart
 * @route   GET /api/cart
 * @access  Private (User)
 */
const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "cartItems.product",
      "name image price"
    );

    if (!cart) {
      return res.status(404).json({ message: "Cart is empty" });
    }

    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Remove an item from the cart
 * @route   DELETE /api/cart/:productId
 * @access  Private (User)
 */
const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Remove the product from the cart
    cart.cartItems = cart.cartItems.filter(
      (item) => item.product.toString() !== productId
    );

    await cart.save();
    res.status(200).json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { addToCart, getCart, removeFromCart };
