import User from "../models/user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export async function createUser(req, res) {
  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    // Create user with hashed password
    const newUser = new User({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      password: hashedPassword,
      role: req.body.role,
    });

    const savedUser = await newUser.save();

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(400).json({
      error: "Failed to create user",
      details: error.message,
    });
  }
}

export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    // Compare password
    const passwordValid = await bcrypt.compare(password, user.password);
    
    if (passwordValid) {
      // Create JWT token
      const token = jwt.sign({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive
      }, process.env.JWT_SECRET, { expiresIn: "1h" });

      res.json({ 
        token: token,
        message: "Login Successful"
      });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({
      error: "Failed to log in",
      details: error.message,
    });
  }
}

// ==================== USER MANAGEMENT FUNCTIONS ====================

// Get all users (Admin function)
export async function getAllUsers(req, res) {
  try {
    // Check if user is authenticated via JWT (from middleware)
    if (req.user && req.user.role === 'admin') {
      const users = await User.find().select('-password');
      
      res.status(200).json({
        message: "Users retrieved successfully",
        users: users
      });
    } else {
      // Fallback: check adminId in query params
      const { adminId } = req.query;
      
      if (!adminId) {
        return res.status(403).json({ error: "Admin authentication required" });
      }
      
      const admin = await User.findById(adminId);
      if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can view all users" });
      }

      const users = await User.find().select('-password');
      
      res.status(200).json({
        message: "Users retrieved successfully",
        users: users
      });
    }
  } catch (error) {
    res.status(500).json({
      error: "Failed to get users",
      details: error.message
    });
  }
}

// Get user by ID
export async function getUserById(req, res) {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      message: "User retrieved successfully",
      user: user
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get user",
      details: error.message
    });
  }
}

// Update user profile
export async function updateUserProfile(req, res) {
  try {
    const { userId } = req.params;
    const { firstName, lastName, bio, phoneNumber, address } = req.body;
    
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, bio, phoneNumber, address },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to update profile",
      details: error.message
    });
  }
}

// Delete user (Admin function)
export async function deleteUser(req, res) {
  try {
    const { userId } = req.params;
    const { adminId } = req.body;
    
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: "Only administrators can delete users" });
    }

    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      message: "User deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to delete user",
      details: error.message
    });
  }
}

// ==================== ASSIGNMENT FUNCTIONS ====================

// ==================== ADMIN FUNCTIONS ====================

// Manage users (Admin function)
export async function manageUsers(req, res) {
  try {
    const { adminId } = req.query;
    
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: "Only administrators can manage users" });
    }

    const users = await User.find().select('-password');
    
    const userStats = {
      totalUsers: users.length,
      students: users.filter(u => u.role === 'student').length,
      instructors: users.filter(u => u.role === 'instructor').length,
      admins: users.filter(u => u.role === 'admin').length,
      activeUsers: users.filter(u => u.isActive).length
    };

    res.status(200).json({
      message: "Users retrieved successfully",
      stats: userStats,
      users: users
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to manage users",
      details: error.message
    });
  }
}

// Monitor activity (Admin function)
export async function monitorActivity(req, res) {
  try {
    const { adminId } = req.query;
    
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: "Only administrators can monitor activity" });
    }

    // Here you would typically get activity data from various models
    const activity = {
      recentLogins: [], // Would come from login logs
      courseEnrollments: [], // Would come from enrollment data
      newUsers: await User.find().sort({ createdAt: -1 }).limit(10).select('-password'),
      systemHealth: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date()
      }
    };

    res.status(200).json({
      message: "Activity data retrieved successfully",
      activity: activity
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to monitor activity",
      details: error.message
    });
  }
}

// Handle payments (Admin function)
export async function handlePayments(req, res) {
  try {
    const { paymentId } = req.params;
    const { adminId, action, reason } = req.body; // action: 'approve', 'refund', 'dispute'
    
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({ error: "Only administrators can handle payments" });
    }

    // Here you would typically update payment status in a Payment model
    const paymentAction = {
      paymentId,
      action,
      reason,
      processedBy: adminId,
      processedAt: new Date(),
      status: action === 'approve' ? 'completed' : action === 'refund' ? 'refunded' : 'disputed'
    };

    res.status(200).json({
      message: `Payment ${action} processed successfully`,
      paymentAction: paymentAction
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to handle payment",
      details: error.message
    });
  }
}
