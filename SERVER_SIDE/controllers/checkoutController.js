import Cart from "../models/cartModel.js";
import Order from "../models/orderModel.js";
import Discount from "../models/discountModel.js";



// Checkout controller for handling order placement
 const checkoutOrder = async (req, res) => {
    try {
      const { discountCode, cartId, shippingAddress } = req.body;
      
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // Retrieve the cart items for the user
      const cart = await Cart.findById(cartId);
      if (!cart || cart.user.toString() !== user._id.toString()) {
        return res.status(400).json({ message: "Invalid cart" });
      }
  
      // Calculate the total order value from the cart
      let orderTotal = cart.cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  
      // Check if a discount code is applied
      if (discountCode) {
        // Find the discount
        const discount = await Discount.findOne({ code: discountCode });
        if (discount && discount.expiryDate > Date.now() && discount.active) {
          const discountAmount = (orderTotal * discount.percentage) / 100;
          orderTotal -= discountAmount;
        } else {
          return res.status(400).json({ message: "Invalid or expired discount code" });
        }
      }
  
      // Create a new order
      const newOrder = new Order({
        user: user._id,
        orderItems: cart.cartItems,
        shippingAddress,
        totalAmount: orderTotal,
        status: "Pending",
      });
  
      await newOrder.save();
  
      // Optionally, clear the cart after placing the order
      cart.cartItems = [];
      await cart.save();
  
      // Respond with order details
      res.status(200).json({ message: "Order placed successfully", order: newOrder });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

  // Create a new discount code
const createDiscountCode = async (req, res) => {
    try {
      const { code, percentage, expiryDate } = req.body;
  
      // Basic validation
      if (!code || !percentage || !expiryDate) {
        return res.status(400).json({ message: "All fields are required" });
      }
  
      // Check if discount code already exists
      const existingDiscount = await Discount.findOne({ code });
      if (existingDiscount) {
        return res.status(409).json({ message: "Discount code already exists" });
      }
  
      const discount = new Discount({
        code,
        percentage,
        expiryDate,
      });
  
      await discount.save();
  
      res.status(201).json({ message: "Discount code created successfully", discount });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

export { checkoutOrder, createDiscountCode };
