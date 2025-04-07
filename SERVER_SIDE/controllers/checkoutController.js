import Cart from "../models/cartModel.js";
import Order from "../models/orderModel.js";

// Checkout Controller
const checkoutOrder = async (req, res) => {
  try {
    const { userId, paymentDetails, deliveryAddress } = req.body;

    // 1. Retrieve the user's cart
    const cart = await Cart.findOne({ user: userId });
    if (!cart || cart.cartItems.length === 0) {
      return res.status(400).json({ message: "Your cart is empty. Add some items to proceed." });
    }

    // 2. Calculate the total amount for the order
    const totalAmount = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);

    // 3. Create a new order based on the cart items
    const newOrder = new Order({
      user: userId,
      orderItems: cart.cartItems,
      totalAmount,
      paymentDetails, // This could contain payment method and status
      deliveryAddress,
      status: "pending", // Initial status when the order is placed
    });

    // 4. Save the order to the database
    await newOrder.save();

    // 5. Optionally, clear the user's cart (empty it after checkout)
    await Cart.deleteOne({ user: userId });

    // 6. Respond to the client with the order details
    res.status(200).json({ message: "Order placed successfully", order: newOrder });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to process checkout." });
  }
};

export { checkoutOrder };
