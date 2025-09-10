import express from 'express';
import { 
  createProgressRecord,
  getStudentCourseProgress,
  getStudentAllProgress,
  markLessonComplete,
  markModuleComplete,
  addTimeSpent,
  getCourseProgressStats,
  getInstructorCoursesProgress,
  updateStudentScores,
  generateCertificateForStudent,
  getStudentsEligibleForCertificates
} from '../controllers/progressController.js';

const progressRouter = express.Router();

// ==================== STUDENT PROGRESS ROUTES ====================

// Create progress record (usually called when enrolling)
progressRouter.post('/courses/:courseId', createProgressRecord);

// Get student's progress for a specific course
progressRouter.get('/courses/:courseId', getStudentCourseProgress);

// Get all progress records for a student
progressRouter.get('/student/:studentId', getStudentAllProgress);

// Get all progress records for authenticated student (JWT)
progressRouter.get('/my-progress', getStudentAllProgress);

// Mark lesson as complete
progressRouter.patch('/courses/:courseId/modules/:moduleId/lessons/:lessonId/complete', markLessonComplete);

// Mark module as complete
progressRouter.patch('/courses/:courseId/modules/:moduleId/complete', markModuleComplete);

// Add time spent tracking
progressRouter.patch('/courses/:courseId/time', addTimeSpent);
progressRouter.patch('/courses/:courseId/modules/:moduleId/time', addTimeSpent);

// ==================== INSTRUCTOR/ADMIN ROUTES ====================

// Get course progress statistics (for instructors)
progressRouter.get('/courses/:courseId/stats', getCourseProgressStats);

// Get all progress for instructor's courses
progressRouter.get('/instructor/:instructorId/courses', getInstructorCoursesProgress);

// Get all progress for authenticated instructor's courses (JWT)
progressRouter.get('/my-courses', getInstructorCoursesProgress);

// ==================== SCORE AND CERTIFICATE ROUTES ====================

// Update student scores (quiz/assignment scores)
progressRouter.patch('/courses/:courseId/scores', updateStudentScores);

// Manually generate certificate for completed student
progressRouter.post('/courses/:courseId/students/:studentId/certificate', generateCertificateForStudent);

// Get students eligible for certificates in a course
progressRouter.get('/courses/:courseId/eligible-certificates', getStudentsEligibleForCertificates);

export default progressRouter;
