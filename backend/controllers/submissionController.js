import Submission from '../models/submission.js';
import User from '../models/user.js';
import Course from '../models/course.js';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = 'uploads/submissions';
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `submission-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow common file types
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|mp3|ppt|pptx|xls|xlsx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, documents, videos, and archives are allowed.'));
  }
};

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: fileFilter
});

// Helper function to get user from token or fallback
const getUserFromRequest = async (req) => {
  let user = null;

  // Try JWT first
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = await User.findById(decoded.userId);
    } catch (error) {
      console.log('JWT verification failed:', error.message);
    }
  }

  // Fallback to query/body - check multiple possible field names
  if (!user) {
    const userId = req.query.userId || req.body.userId || req.query.studentId || req.body.studentId;
    if (userId) {
      user = await User.findById(userId);
    }
  }

  return user;
};

// Create a new submission
export const createSubmission = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const {
      assignmentId,
      assignmentTitle,
      assignmentMaxPoints,
      courseId,
      submissionType,
      textContent,
      urls,
      comments
    } = req.body;

    // Verify course enrollment
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is enrolled - handle multiple possible structures
    let isEnrolled = false;

    // Check in students array (if exists)
    if (course.students && Array.isArray(course.students)) {
      if (course.students.length > 0) {
        if (typeof course.students[0] === 'object' && course.students[0].student) {
          isEnrolled = course.students.some(enrollment => 
            enrollment.student.toString() === user._id.toString()
          );
        } else {
          isEnrolled = course.students.some(studentId => 
            studentId.toString() === user._id.toString()
          );
        }
      }
    }

    // Check in enrolledStudents array (if exists and not already enrolled)
    if (!isEnrolled && course.enrolledStudents && Array.isArray(course.enrolledStudents)) {
      if (course.enrolledStudents.length > 0) {
        if (typeof course.enrolledStudents[0] === 'object' && course.enrolledStudents[0].student) {
          isEnrolled = course.enrolledStudents.some(enrollment => 
            enrollment.student.toString() === user._id.toString()
          );
        } else {
          isEnrolled = course.enrolledStudents.some(studentId => 
            studentId.toString() === user._id.toString()
          );
        }
      }
    }

    if (!isEnrolled) {
      return res.status(403).json({ message: 'Not enrolled in this course' });
    }

    // Check for existing submission
    const existingSubmission = await Submission.findOne({
      student: user._id,
      'assignment.assignmentId': assignmentId,
      course: courseId
    });

    if (existingSubmission && existingSubmission.status !== 'returned') {
      return res.status(400).json({ 
        message: 'Submission already exists for this assignment',
        submissionId: existingSubmission._id
      });
    }

    // Process uploaded files
    const files = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        files.push({
          fileName: file.originalname,
          fileUrl: file.path,
          fileType: file.mimetype,
          fileSize: file.size
        });
      }
    }

    // Create submission data
    const submissionData = {
      student: user._id,
      assignment: {
        assignmentId,
        title: assignmentTitle,
        maxPoints: assignmentMaxPoints
      },
      course: courseId,
      submissionType,
      content: {
        textContent: textContent || '',
        files,
        urls: urls ? (Array.isArray(urls) ? urls : [urls]) : [],
        comments: comments || ''
      },
      attemptNumber: existingSubmission ? existingSubmission.attemptNumber + 1 : 1,
      status: 'submitted'
    };

    const submission = new Submission(submissionData);
    await submission.save();

    // Populate references for response
    await submission.populate('student', 'firstName lastName email');
    await submission.populate('course', 'title');

    res.status(201).json({
      message: 'Submission created successfully',
      submission
    });

  } catch (error) {
    console.error('Error creating submission:', error);
    res.status(500).json({ 
      message: 'Error creating submission', 
      error: error.message 
    });
  }
};

// Get submission by ID
export const getSubmissionById = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { submissionId } = req.params;
    
    const submission = await Submission.findById(submissionId)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title instructor')
      .populate('grade.gradedBy', 'firstName lastName')
      .lean(); // Use lean to get plain objects

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Check access permissions
    const isStudent = submission.student._id.toString() === user._id.toString();
    const isInstructor = submission.course && submission.course.instructor && 
                        submission.course.instructor.toString() === user._id.toString();
    
    if (!isStudent && !isInstructor && user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Add safe virtual properties manually
    submission.isGraded = submission.status === 'graded' && 
                         submission.grade && 
                         submission.grade.score !== undefined;

    if (submission.grade && submission.grade.score !== undefined && submission.grade.maxScore) {
      submission.gradePercentage = Math.round((submission.grade.score / submission.grade.maxScore) * 100);
    } else {
      submission.gradePercentage = null;
    }

    res.json({ submission });

  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ 
      message: 'Error fetching submission', 
      error: error.message 
    });
  }
};

// Get all submissions for an assignment (instructor only)
export const getAssignmentSubmissions = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { assignmentId } = req.params;
    const { status, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;

    // Find a submission to get the course and verify instructor
    const sampleSubmission = await Submission.findOne({ 'assignment.assignmentId': assignmentId })
      .populate('course', 'instructor');

    if (!sampleSubmission) {
      return res.status(404).json({ message: 'No submissions found for this assignment' });
    }

    // Verify instructor access
    if (sampleSubmission.course.instructor.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only instructors can view all submissions' });
    }

    // Build query
    const query = { 'assignment.assignmentId': assignmentId };
    if (status) {
      query.status = status;
    }

    // Get submissions
    const submissions = await Submission.find(query)
      .populate('student', 'firstName lastName email')
      .populate('grade.gradedBy', 'firstName lastName')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 });

    // Get grading statistics
    const stats = await Submission.getGradingStats(assignmentId);

    res.json({
      submissions,
      stats: stats[0] || {
        totalSubmissions: 0,
        gradedSubmissions: 0,
        averageScore: 0,
        averagePercentage: 0,
        highestScore: 0,
        lowestScore: 0
      },
      total: submissions.length
    });

  } catch (error) {
    console.error('Error fetching assignment submissions:', error);
    res.status(500).json({ 
      message: 'Error fetching submissions', 
      error: error.message 
    });
  }
};

// Get student's submissions for a course
export const getStudentSubmissions = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId } = req.params;
    const { studentId } = req.query;

    // Determine which student's submissions to fetch
    const targetStudentId = studentId || user._id;

    // Verify access permissions
    if (targetStudentId !== user._id.toString()) {
      // Check if user is instructor of the course
      const course = await Course.findById(courseId);
      if (!course || (course.instructor.toString() !== user._id.toString() && user.role !== 'admin')) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const submissions = await Submission.getStudentCourseSubmissions(targetStudentId, courseId);

    res.json({
      submissions,
      total: submissions.length
    });

  } catch (error) {
    console.error('Error fetching student submissions:', error);
    res.status(500).json({ 
      message: 'Error fetching submissions', 
      error: error.message 
    });
  }
};

// Grade a submission (instructor only)
export const gradeSubmission = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { submissionId } = req.params;
    const { score, maxScore, feedback, rubricScores, letterGrade } = req.body;

    const submission = await Submission.findById(submissionId)
      .populate('course', 'instructor');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Verify instructor access
    if (submission.course.instructor.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only instructors can grade submissions' });
    }

    // Prepare grade data
    const gradeData = {
      score: parseFloat(score),
      maxScore: parseFloat(maxScore),
      feedback,
      rubricScores: rubricScores || [],
      letterGrade
    };

    // Use the model method to grade submission
    await submission.gradeSubmission(gradeData, user._id);

    // Populate for response
    await submission.populate('grade.gradedBy', 'firstName lastName');

    res.json({
      message: 'Submission graded successfully',
      submission
    });

  } catch (error) {
    console.error('Error grading submission:', error);
    res.status(500).json({ 
      message: 'Error grading submission', 
      error: error.message 
    });
  }
};

// Update submission (for resubmissions)
export const updateSubmission = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { submissionId } = req.params;
    const { textContent, urls, comments } = req.body;

    const submission = await Submission.findById(submissionId);

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Verify student access
    if (submission.student.toString() !== user._id.toString()) {
      return res.status(403).json({ message: 'Can only update your own submissions' });
    }

    // Check if resubmission is allowed
    // Students can update: submitted, returned submissions
    // Students cannot update: graded submissions (unless returned)
    if (submission.status === 'graded') {
      return res.status(400).json({ 
        message: 'Cannot update graded submissions. Ask instructor to return for revision.' 
      });
    }

    if (!['submitted', 'returned', 'resubmitted'].includes(submission.status)) {
      return res.status(400).json({ 
        message: 'Submission cannot be updated in current status' 
      });
    }

    // Process new files
    const newFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        newFiles.push({
          fileName: file.originalname,
          fileUrl: file.path,
          fileType: file.mimetype,
          fileSize: file.size
        });
      }
    }

    // Update submission content
    submission.content = {
      textContent: textContent || submission.content.textContent,
      files: [...submission.content.files, ...newFiles],
      urls: urls ? (Array.isArray(urls) ? urls : [urls]) : submission.content.urls,
      comments: comments || submission.content.comments
    };

    submission.status = 'resubmitted';
    submission.submittedAt = new Date();

    await submission.save();

    // Get updated submission safely with .lean()
    const updatedSubmission = await Submission.findById(submissionId)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title')
      .lean();

    // Add safe virtual properties
    updatedSubmission.isGraded = updatedSubmission.status === 'graded' && 
                                updatedSubmission.grade && 
                                updatedSubmission.grade.score !== undefined;

    res.json({
      message: 'Submission updated successfully',
      submission: updatedSubmission
    });

  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ 
      message: 'Error updating submission', 
      error: error.message 
    });
  }
};

// Delete submission (admin only)
export const deleteSubmission = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { submissionId } = req.params;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Delete associated files
    if (submission.content.files && submission.content.files.length > 0) {
      for (const file of submission.content.files) {
        try {
          await fs.unlink(file.fileUrl);
        } catch (error) {
          console.error('Error deleting file:', error);
        }
      }
    }

    await Submission.findByIdAndDelete(submissionId);

    res.json({ message: 'Submission deleted successfully' });

  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ 
      message: 'Error deleting submission', 
      error: error.message 
    });
  }
};

// Return submission for revision (instructor only)
export const returnSubmissionForRevision = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { submissionId } = req.params;
    const { feedback } = req.body;

    const submission = await Submission.findById(submissionId)
      .populate('course', 'instructor');

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    // Verify instructor access
    if (submission.course.instructor.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only instructors can return submissions' });
    }

    submission.status = 'returned';
    if (feedback) {
      submission.grade = submission.grade || {};
      submission.grade.feedback = feedback;
    }

    await submission.save();

    res.json({
      message: 'Submission returned for revision',
      submission
    });

  } catch (error) {
    console.error('Error returning submission:', error);
    res.status(500).json({ 
      message: 'Error returning submission', 
      error: error.message 
    });
  }
};

// Get submission statistics for course (instructor only)
export const getCourseSubmissionStats = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId } = req.params;

    // Verify instructor access
    const course = await Course.findById(courseId);
    if (!course || (course.instructor.toString() !== user._id.toString() && user.role !== 'admin')) {
      return res.status(403).json({ message: 'Only instructors can view course statistics' });
    }

    const stats = await Submission.aggregate([
      { $match: { course: mongoose.Types.ObjectId(courseId) } },
      {
        $group: {
          _id: '$assignment.assignmentId',
          assignmentTitle: { $first: '$assignment.title' },
          totalSubmissions: { $sum: 1 },
          gradedSubmissions: {
            $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] }
          },
          averageScore: { $avg: '$grade.score' },
          averagePercentage: { $avg: '$grade.percentage' },
          highestScore: { $max: '$grade.score' },
          lowestScore: { $min: '$grade.score' },
          lateSubmissions: {
            $sum: { $cond: ['$isLate', 1, 0] }
          }
        }
      },
      { $sort: { assignmentTitle: 1 } }
    ]);

    res.json({ stats });

  } catch (error) {
    console.error('Error fetching course submission stats:', error);
    res.status(500).json({ 
      message: 'Error fetching statistics', 
      error: error.message 
    });
  }
};
