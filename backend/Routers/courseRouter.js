import express from 'express';
import { 
  createCourse,
  getAllCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  uploadContent,
  enrollInCourse,
  getStudentCourses,
  trackProgress,
  addCourseReview,
  createQuiz,
  getModuleQuizzes,
  createAssignment,
  getModuleAssignments,
  publishCourse,
  unpublishCourse,
  archiveCourse
} from '../controllers/courseController.js';

const courseRouter = express.Router();

// Course management routes
courseRouter.post('/', createCourse);                    // Create course
courseRouter.get('/', getAllCourses);                    // Get all courses
courseRouter.get('/:courseId', getCourseById);           // Get course by ID
courseRouter.put('/:courseId', updateCourse);            // Update course
courseRouter.delete('/:courseId', deleteCourse);         // Delete course

// Course content routes
courseRouter.post('/:courseId/content', uploadContent);  // Upload content

// Student course routes
courseRouter.post('/:courseId/enroll', enrollInCourse);  // Enroll in course
courseRouter.get('/student/:studentId', getStudentCourses); // Get student's courses
courseRouter.get('/:courseId/progress', trackProgress);  // Track progress

// Course review routes
courseRouter.post('/:courseId/reviews', addCourseReview); // Add review

// Quiz management routes
courseRouter.post('/:courseId/quizzes', createQuiz);           // Create quiz
courseRouter.get('/:courseId/modules/:moduleIndex/quizzes', getModuleQuizzes); // Get module quizzes

// Assignment management routes
courseRouter.post('/:courseId/assignments', createAssignment);     // Create assignment
courseRouter.get('/:courseId/modules/:moduleIndex/assignments', getModuleAssignments); // Get module assignments

// Course status management routes
courseRouter.patch('/:courseId/publish', publishCourse);         // Publish course
courseRouter.patch('/:courseId/unpublish', unpublishCourse);     // Unpublish course
courseRouter.patch('/:courseId/archive', archiveCourse);         // Archive course

export default courseRouter;
