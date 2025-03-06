import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const protectRoute = (req, res, next) => {
  try {
    const token = req.cookies.jwt; // Get the token from cookies
    console.log("Token received:", token); // Log the token

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded Token:", decoded); // Log the decoded token

    // Attach user data to req.user
    req.user = decoded;

    next(); // Continue to the next middleware or controller
  } catch (error) {
    console.error("Token verification error:", error.message);
    res.status(401).json({ message: "Invalid token" });
  }
};


const protectAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
      return res.status(403).json({ message: "Access denied, admin only" });
    }
    next();
  };

  export { protectRoute, protectAdmin };
