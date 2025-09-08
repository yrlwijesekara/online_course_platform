import express from 'express';
import { 
  createUser, 
  loginUser,
  getAllUsers,
  getUserById,
  updateUserProfile,
  deleteUser,
  manageUsers,
  monitorActivity,
  handlePayments
} from '../controllers/userController.js';

const userRouter = express.Router();

// Basic user routes
userRouter.post('/', createUser);                        // Create user
userRouter.post('/login', loginUser);                    // Login user
userRouter.get('/', getAllUsers);                        // Get all users (Admin)
userRouter.get('/:userId', getUserById);                 // Get user by ID
userRouter.put('/:userId', updateUserProfile);           // Update user profile
userRouter.delete('/:userId', deleteUser);               // Delete user (Admin)

// Admin routes
userRouter.get('/admin/users', manageUsers);             // Manage users
userRouter.get('/admin/activity', monitorActivity);      // Monitor activity
userRouter.post('/admin/payments/:paymentId', handlePayments); // Handle payments

export default userRouter;
