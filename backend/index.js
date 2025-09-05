import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import userRouter from "./Routers/userRouter.js";

// Load environment variables
dotenv.config({ path: '../.env' });

const app = express();

app.use(bodyParser.json());

// JWT Authentication Middleware
app.use((req, res, next) => {
  const value = req.headers['authorization'];
  if (value != null) {
    const token = value.replace("Bearer ", "");
    jwt.verify(token, "secret", (err, decoded) => {
      if (decoded == null) {
        return res.status(401).json({ error: "Unauthorized" });
      } else {
        req.user = decoded;
        next();
      }
    });
  } else {
    next();
  }
});

const connectionString = process.env.DATABASE_URL || "mongodb+srv://course_platform:course123@cluster0.beepekj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0m";

mongoose
  .connect(connectionString)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

app.use("/users", userRouter);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
