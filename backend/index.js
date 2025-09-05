import express from "express";
import mongoose from "mongoose";
import bodyParser from "body-parser";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: '../.env' });

const app = express();

app.use(bodyParser.json());

const connectionString = process.env.DATABASE_URL || "mongodb+srv://course_platform:course123@cluster0.beepekj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0m";

mongoose
  .connect(connectionString)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

app.post("/", (req, res) => {
  const course = req.body;
  console.log("Received course:", course);
  // Save the course to the database
  res.status(201).json(course);
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
