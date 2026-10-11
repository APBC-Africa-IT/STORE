import User from "../models/User.js";
import { Cart, CartItem } from "../models/cartModel.js";
import { Order, OrderItem } from "../models/orderModel.js";
import Discount from "../models/discountModel.js";
import { sequelize } from "../config/db.js";

/**
 * @desc    Place an order from the user's cart
 * @route   POST /api/checkout
 * @access  Private (User)
 */
const checkoutOrder = async (req, res) => {
  // Use a transaction so partial failures roll back cleanly
  const t = await sequelize.transaction();

  try {
    const { discountCode, cartId, shippingAddress } = req.body;

    const user = await User.findByPk(req.user.id, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: "User not found" });
    }

    // Fetch the cart together with its items
    const cart = await Cart.findByPk(parseInt(cartId), {
      include: [{ model: CartItem, as: "cartItems" }],
      transaction: t,
    });

    if (!cart || cart.userId !== user.id) {
      await t.rollback();
      return res.status(400).json({ message: "Invalid cart" });
    }

    if (!cart.cartItems || cart.cartItems.length === 0) {
      await t.rollback();
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Calculate order total from cart items
    let orderTotal = cart.cartItems.reduce(
      (total, item) => total + parseFloat(item.price) * item.quantity,
      0
    );

    // Apply discount code if provided
    if (discountCode) {
      const discount = await Discount.findOne({
        where: { code: discountCode },
        transaction: t,
      });

      if (discount && discount.expiryDate > new Date() && discount.active) {
        const discountAmount = (orderTotal * discount.percentage) / 100;
        orderTotal -= discountAmount;
      } else {
        await t.rollback();
        return res.status(400).json({ message: "Invalid or expired discount code" });
      }
    }

    // Create the order record
    const newOrder = await Order.create(
      {
        userId: user.id,
        totalAmount: orderTotal,
        paymentMethod: req.body.paymentMethod || null,
        paymentStatus: req.body.paymentStatus || "pending",
        deliveryAddress: shippingAddress,
        status: "pending",
      },
      { transaction: t }
    );

    // Bulk-create order items from the cart snapshot
    const orderItemsData = cart.cartItems.map((item) => ({
      orderId: newOrder.id,
      productId: item.productId,
      name: item.name,
      image: item.image,
      price: item.price,
      quantity: item.quantity,
    }));

    await OrderItem.bulkCreate(orderItemsData, { transaction: t });

    // Clear the cart items after successful order creation
    await CartItem.destroy({ where: { cartId: cart.id }, transaction: t });

    await t.commit();

    // Reload order with items for the response
    const orderWithItems = await Order.findByPk(newOrder.id, {
      include: [{ model: OrderItem, as: "orderItems" }],
    });

    res.status(200).json({
      message: "Order placed successfully",
      order: orderWithItems,
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: error.message });
  }
};

/**
 * @desc    Create a discount code (Admin only)
 * @route   POST /api/checkout/discount
 * @access  Admin
 */
const createDiscountCode = async (req, res) => {
  try {
    const { code, percentage, expiryDate } = req.body;

    if (!code || !percentage || !expiryDate) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingDiscount = await Discount.findOne({ where: { code } });
    if (existingDiscount) {
      return res.status(409).json({ message: "Discount code already exists" });
    }

    const discount = await Discount.create({ code, percentage, expiryDate });

    res.status(201).json({ message: "Discount code created successfully", discount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { checkoutOrder, createDiscountCode };
