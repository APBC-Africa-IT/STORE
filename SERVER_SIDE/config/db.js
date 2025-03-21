import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Set strictQuery to true (recommended for schema validation)
mongoose.set("strictQuery", true);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    // console.log(`MongoDB Connected to:`, conn.connection.hosts);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
