import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from 'url';
import userRouter from "./Routers/userRouter.js";
import courseRouter from "./Routers/courseRouter.js";
import progressRouter from "./Routers/progressRouter.js";
import submissionRouter from "./Routers/submissionRouter.js";
import discussionRouter from "./Routers/discussionRoutes.js";
import messageRouter from "./Routers/messageRoutes.js";

// Fix for ES modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Debug: Check if environment variables are loaded
console.log('=== Environment Variables Debug ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Loaded ✓' : 'Not loaded ✗');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded ✓' : 'Not loaded ✗');
console.log('JWT_SECRET value:', process.env.JWT_SECRET);
console.log('===================================');

const app = express();

app.use(bodyParser.json());

// JWT Authentication Middleware
app.use((req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    // Use environment variable or fallback
    const JWT_SECRET = process.env.JWT_SECRET ;
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        console.log("JWT verification failed:", err?.message);
        // Don't set req.user, just continue
        next();
      } else {
        // Set user info in request for successful verification
        req.user = decoded;
        next();
      }
    });
  } else {
    next();
  }
});

const connectionString = process.env.DATABASE_URL ;

mongoose
  .connect(connectionString)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

app.use("/api/users", userRouter);
app.use("/api/courses", courseRouter);
app.use("/api/progress", progressRouter);
app.use("/api/submissions", submissionRouter);
app.use("/api/discussions", discussionRouter);
app.use("/api/messages", messageRouter);


const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
