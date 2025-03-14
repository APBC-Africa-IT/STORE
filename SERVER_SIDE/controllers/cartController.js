import Cart from "../models/cartModel.js";
import Product from "../models/Products.js";

/**
 * @desc    Add a product to the cart
 * @route   POST /api/cart
 * @access  Private (User)
 */
const addToCart = async (req, res) => {
  try {
    console.log("Authenticated User ID:", req.user?._id);

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
      existingItem.total = existingItem.quantity * existingItem.price; // Ensure total is updated
    } else {
      // Add new item to the cart with total price
      cart.cartItems.push({
        product: product._id,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity,
        total: quantity * product.price, // Ensure total is assigned
      });
    }

    await cart.save();

    // Calculate overall total for the entire cart
    const cartTotal = cart.cartItems.reduce((sum, item) => {
      return sum + (item.total || item.quantity * item.price);
    }, 0);

    res.status(200).json({ cart, cartTotal });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    get the cart
 * @route   GET /api/cart
 * @access  Private (User)
 */

const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "cartItems.product",
      "name image price stock"
    );

    if (!cart) {
      return res.status(404).json({ message: "Cart is empty" });
    }

    // Transform cart data to move quantity inside product
    const transformedCartItems = cart.cartItems.map(item => ({
      _id: item._id, // Cart item ID
      product: {
        ...item.product.toObject(),
        quantity: item.quantity // Move quantity inside product
      }
    }));

    // Calculate cart total
    const cartTotal = transformedCartItems.reduce(
      (total, item) => total + item.product.price * item.product.quantity,
      0
    );

    res.status(200).json({
      cart: { ...cart.toObject(), cartItems: transformedCartItems },
      cartTotal
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * @desc    Update quantity of a product in the cart
 * @route   PUT /api/cart/:cartItemId
 * @access  Private (User)
 */
const updateCartItemQuantity = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const { quantity } = req.body;

    // Ensure quantity is positive
    if (quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }

    // Find user's cart
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the cart item by its unique ID
    const cartItem = cart.cartItems.find(
      (item) => item._id.toString() === cartItemId
    );

    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    // Update the quantity
    cartItem.quantity = quantity;
    cartItem.total = cartItem.quantity * cartItem.price; // Ensure total is updated

    // Recalculate cart total properly
    const cartTotal = cart.cartItems.reduce((sum, item) => {
      return sum + (item.total || item.quantity * item.price);
    }, 0);

    // Ensure the cartTotal is not null
    cart.cartTotal = cartTotal;

    await cart.save();

    res.status(200).json({ cart, cartTotal });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * @desc    Remove an item from the cart using productId
 * @route   DELETE /api/cart/:productId
 * @access  Private (User)
 */
const removeCartItem = async (req, res) => {
  try {
    const { productId } = req.params;

    // Find user's cart
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Filter out the cart item with the given productId
    const updatedCartItems = cart.cartItems.filter(
      (item) => item.product.toString() !== productId
    );

    // Check if any item was actually removed
    if (updatedCartItems.length === cart.cartItems.length) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    cart.cartItems = updatedCartItems;

    // Recalculate cart total
    const cartTotal = updatedCartItems.reduce((sum, item) => {
      return sum + (item.total || item.quantity * item.price);
    }, 0);

    // Update cart total and ensure it is included in the response
    cart.cartTotal = cartTotal;

    await cart.save();

    res.status(200).json({ 
      message: "Item removed successfully", 
      cart: { ...cart.toObject(), cartTotal }, // Ensure cartTotal is included 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


/**
 * @desc    Delete the entire cart for a user
 * @route   DELETE /api/cart
 * @access  Private (User)
 */
const deleteCart = async (req, res) => {
  try {
    // Find user's cart
    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Remove the cart from the database
    await Cart.findOneAndDelete({ user: req.user._id });

    res.status(200).json({ message: "Cart successfully deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export { addToCart, getCart, updateCartItemQuantity, removeCartItem, deleteCart };
