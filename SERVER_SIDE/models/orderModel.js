import mongoose from "mongoose";

// Order Schema
const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    totalAmount: { type: Number, required: true },
    paymentDetails: {
      method: { type: String, required: true }, // Payment method (e.g., Credit Card, M-Pesa)
      status: { type: String, required: true }, // Payment status (e.g., pending, completed)
    },
    deliveryAddress: { type: String, required: true },
    status: { type: String, default: "pending" }, // 'pending' or 'completed'
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
