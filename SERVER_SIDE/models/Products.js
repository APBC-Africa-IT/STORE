import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image: { type: String, required: true }, // Image URL or Cloudinary link
    price: { type: Number, required: true, default: 0 },
    description: { type: String, required: true },
    category: { type: String, required: true }, // e.g., Engine, Body, Suspension
    carMake: { type: String, required: true }, // e.g., Toyota, Nissan
    carModel: { type: String, required: true }, // e.g., Corolla, X-Trail
    year: { type: String, required: true }, // Compatible years
    condition: { type: String, enum: ["New", "Used"], required: true },
    transmission: { type: String, enum: ["Manual", "Automatic"], required: true },
    fuelType: { type: String, enum: ["Petrol", "Diesel"], required: true },
    stock: { type: Number, required: true, default: 0 }, // Available quantity
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }, // Now optional
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);

export default Product;
