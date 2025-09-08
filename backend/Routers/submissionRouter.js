import express from 'express';
import {
  createSubmission,
  getSubmissionById,
  getAssignmentSubmissions,
  getStudentSubmissions,
  gradeSubmission,
  updateSubmission,
  deleteSubmission,
  returnSubmissionForRevision,
  getCourseSubmissionStats,
  upload
} from '../controllers/submissionController.js';

const router = express.Router();

// Create new submission (with file upload)
router.post('/create', upload.array('files', 10), createSubmission);

// Get submission by ID
router.get('/:submissionId', getSubmissionById);

// Get all submissions for an assignment (instructor only)
router.get('/assignment/:assignmentId', getAssignmentSubmissions);

// Get student submissions for a course
router.get('/course/:courseId/student', getStudentSubmissions);

// Grade a submission (instructor only)
router.put('/:submissionId/grade', gradeSubmission);

// Update submission (for resubmissions)
router.put('/:submissionId/update', upload.array('files', 10), updateSubmission);

// Return submission for revision (instructor only)
router.put('/:submissionId/return', returnSubmissionForRevision);

// Delete submission (admin only)
router.delete('/:submissionId', deleteSubmission);

// Get course submission statistics (instructor only)
router.get('/course/:courseId/stats', getCourseSubmissionStats);

export default router;
