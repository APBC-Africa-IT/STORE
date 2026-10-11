import { Cart, CartItem } from "../models/cartModel.js";
import Product from "../models/Products.js";

/**
 * @desc    Add a product to the cart (or increment quantity if it already exists)
 * @route   POST /api/cart
 * @access  Private (User)
 */
const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const product = await Product.findByPk(parseInt(productId));
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find or create the user's cart
    let [cart] = await Cart.findOrCreate({
      where: { userId: req.user.id },
      defaults: { userId: req.user.id },
    });

    // Check if this product is already in the cart
    const existingItem = await CartItem.findOne({
      where: { cartId: cart.id, productId: product.id },
    });

    if (existingItem) {
      existingItem.quantity += quantity;
      await existingItem.save();
    } else {
      await CartItem.create({
        cartId: cart.id,
        productId: product.id,
        name: product.name,
        image: product.image,
        price: product.price,
        quantity,
      });
    }

    // Reload cart with updated items
    const updatedCart = await Cart.findByPk(cart.id, {
      include: [{ model: CartItem, as: "cartItems" }],
    });

    const cartTotal = updatedCart.cartItems.reduce(
      (sum, item) => sum + parseFloat(item.price) * item.quantity,
      0
    );

    res.status(200).json({ cart: updatedCart, cartTotal });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Get the current user's cart with product details
 * @route   GET /api/cart
 * @access  Private (User)
 */
const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({
      where: { userId: req.user.id },
      include: [
        {
          model: CartItem,
          as: "cartItems",
          include: [
            {
              model: Product,
              as: "product",
              attributes: ["id", "name", "image", "price", "stock"],
            },
          ],
        },
      ],
    });

    if (!cart || cart.cartItems.length === 0) {
      return res.status(404).json({ message: "Cart is empty" });
    }

    // Mirror the original response shape: quantity is merged into the product object
    const transformedCartItems = cart.cartItems.map((item) => ({
      id: item.id,
      product: {
        ...item.product.toJSON(),
        quantity: item.quantity,
      },
    }));

    const cartTotal = transformedCartItems.reduce(
      (total, item) => total + item.product.price * item.product.quantity,
      0
    );

    res.status(200).json({
      cart: { ...cart.toJSON(), cartItems: transformedCartItems },
      cartTotal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Update the quantity of a specific cart item
 * @route   PUT /api/cart/:cartItemId
 * @access  Private (User)
 */
const updateCartItemQuantity = async (req, res) => {
  try {
    const { cartItemId } = req.params;
    const { quantity } = req.body;

    if (quantity <= 0) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }

    const cart = await Cart.findOne({ where: { userId: req.user.id } });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const cartItem = await CartItem.findOne({
      where: { id: parseInt(cartItemId), cartId: cart.id },
    });

    if (!cartItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    cartItem.quantity = quantity;
    await cartItem.save();

    // Reload cart to return fresh state
    const updatedCart = await Cart.findByPk(cart.id, {
      include: [{ model: CartItem, as: "cartItems" }],
    });

    const cartTotal = updatedCart.cartItems.reduce(
      (sum, item) => sum + parseFloat(item.price) * item.quantity,
      0
    );

    res.status(200).json({ cart: updatedCart, cartTotal });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Remove a single product from the cart by productId
 * @route   DELETE /api/cart/:productId
 * @access  Private (User)
 */
const removeCartItem = async (req, res) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ where: { userId: req.user.id } });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const deleted = await CartItem.destroy({
      where: { cartId: cart.id, productId: parseInt(productId) },
    });

    if (!deleted) {
      return res.status(404).json({ message: "Product not found in cart" });
    }

    // Return updated cart
    const updatedCart = await Cart.findByPk(cart.id, {
      include: [{ model: CartItem, as: "cartItems" }],
    });

    const cartTotal = updatedCart.cartItems.reduce(
      (sum, item) => sum + parseFloat(item.price) * item.quantity,
      0
    );

    res.status(200).json({
      message: "Item removed successfully",
      cart: { ...updatedCart.toJSON(), cartTotal },
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
    const cart = await Cart.findOne({ where: { userId: req.user.id } });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // CartItems cascade-delete because of onDelete: "CASCADE" in the model
    await cart.destroy();

    res.status(200).json({ message: "Cart successfully deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { addToCart, getCart, updateCartItemQuantity, removeCartItem, deleteCart };
