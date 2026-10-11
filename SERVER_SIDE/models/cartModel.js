import { DataTypes } from "sequelize";
import { sequelize } from "../config/db.js";
import User from "./User.js";
import Product from "./Products.js";

// ── Cart ────────────────────────────────────────────────────────────────────
const Cart = sequelize.define(
  "Cart",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
  },
  {
    tableName: "carts",
    timestamps: true,
  }
);

// ── CartItem ────────────────────────────────────────────────────────────────
// Replaces the embedded cartItems subdocument array from Mongoose.
const CartItem = sequelize.define(
  "CartItem",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    cartId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "carts", key: "id" },
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
    },
    // Snapshot fields — stored at time of adding so price changes don't
    // retroactively affect existing cart entries.
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
  },
  {
    tableName: "cart_items",
    timestamps: true,
  }
);

// ── Associations ────────────────────────────────────────────────────────────
Cart.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasOne(Cart, { foreignKey: "userId", as: "cart" });

Cart.hasMany(CartItem, { foreignKey: "cartId", as: "cartItems", onDelete: "CASCADE" });
CartItem.belongsTo(Cart, { foreignKey: "cartId" });

CartItem.belongsTo(Product, { foreignKey: "productId", as: "product" });
Product.hasMany(CartItem, { foreignKey: "productId" });

export { Cart, CartItem };
