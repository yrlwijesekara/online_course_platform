import express from 'express';
import { 
  createUser, 
  loginUser,
  // Student functions
  enrollInCourse,
  submitAssignment,
  trackProgress,
  // Instructor functions
  createCourse,
  uploadContent,
  evaluateStudents,
  // Admin functions
  manageUsers,
  monitorActivity,
  handlePayments
} from '../controllers/userController.js';

const userRouter = express.Router();

// Basic user routes
userRouter.post('/', createUser);
userRouter.post('/login', loginUser);

// Student routes
userRouter.post('/enroll/:courseId', enrollInCourse);
userRouter.post('/assignments/:assignmentId/submit', submitAssignment);
userRouter.get('/progress/:courseId', trackProgress);

// Instructor routes
userRouter.post('/courses', createCourse);
userRouter.post('/courses/:courseId/content', uploadContent);
userRouter.post('/evaluate/:studentId/:assignmentId', evaluateStudents);

// Admin routes
userRouter.get('/admin/users', manageUsers);
userRouter.get('/admin/activity', monitorActivity);
userRouter.post('/admin/payments/:paymentId', handlePayments);

export default userRouter;
