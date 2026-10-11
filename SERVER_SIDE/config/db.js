import { Sequelize } from "sequelize";
import dotenv from "dotenv";
dotenv.config();

const sequelize = new Sequelize(process.env.PG_URI, {
  dialect: "postgres",
  dialectOptions: {
    ssl: process.env.PG_SSL === "true"
      ? { require: true, rejectUnauthorized: false }
      : false,
  },
  logging: false, // set to console.log to see SQL queries
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL Connected.");
    // sync: creates tables if they don't exist; use migrations in production
    await sequelize.sync({ alter: false });
    console.log("All models synced.");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export { sequelize };
export default connectDB;
