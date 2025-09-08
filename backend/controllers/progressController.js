import Progress from '../models/progress.js';
import User from '../models/user.js';
import Course from '../models/course.js';
import mongoose from 'mongoose';

// ==================== PROGRESS TRACKING FUNCTIONS ====================

// Create initial progress record when student enrolls
export async function createProgressRecord(req, res) {
  try {
    const { courseId } = req.params;
    
    let studentId;
    let student;

    // Check if user is authenticated via JWT
    if (req.user && req.user.email) {
      student = await User.findOne({ email: req.user.email });
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can have progress records" });
      }
      studentId = student._id.toString();
    } else {
      // Fallback: check studentId in request body
      studentId = req.body.studentId;
      if (!studentId) {
        return res.status(403).json({ error: "Student authentication required" });
      }
      
      student = await User.findById(studentId);
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can have progress records" });
      }
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if progress record already exists
    const existingProgress = await Progress.findOne({ student: studentId, course: courseId });
    if (existingProgress) {
      return res.status(400).json({ error: "Progress record already exists for this course" });
    }

    // Create module progress structure based on course modules
    const moduleProgress = course.modules.map(module => ({
      moduleId: module._id,
      completed: false,
      completedLessons: [],
      timeSpent: 0,
      lastAccessed: new Date()
    }));

    const progress = new Progress({
      student: studentId,
      course: courseId,
      moduleProgress: moduleProgress,
      overallProgress: 0,
      totalTimeSpent: 0
    });

    await progress.save();

    res.status(201).json({
      message: "Progress record created successfully",
      progress: progress
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create progress record",
      details: error.message
    });
  }
}

// Get student's progress for a specific course
export async function getStudentCourseProgress(req, res) {
  try {
    const { courseId } = req.params;
    
    let studentId;
    let student;

    // Check if user is authenticated via JWT
    if (req.user && req.user.email) {
      student = await User.findOne({ email: req.user.email });
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can view progress" });
      }
      studentId = student._id.toString();
    } else {
      // Fallback: check studentId in query params
      studentId = req.query.studentId;
      if (!studentId) {
        return res.status(403).json({ error: "Student authentication required" });
      }
      
      student = await User.findById(studentId);
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can view progress" });
      }
    }

    const progress = await Progress.getStudentProgress(studentId, courseId);
    if (!progress) {
      return res.status(404).json({ error: "Progress record not found" });
    }

    res.status(200).json({
      progress: progress
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get progress",
      details: error.message
    });
  }
}

// Get all progress records for a student
export async function getStudentAllProgress(req, res) {
  try {
    let studentId;
    let student;

    // Check if user is authenticated via JWT
    if (req.user && req.user.email) {
      student = await User.findOne({ email: req.user.email });
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can view progress" });
      }
      studentId = student._id.toString();
    } else {
      // Fallback: check studentId in params
      studentId = req.params.studentId;
      if (!studentId) {
        return res.status(403).json({ error: "Student authentication required" });
      }
      
      student = await User.findById(studentId);
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can view progress" });
      }
    }

    const progressRecords = await Progress.getStudentAllProgress(studentId);

    res.status(200).json({
      student: {
        _id: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email
      },
      progressRecords: progressRecords,
      totalCourses: progressRecords.length,
      completedCourses: progressRecords.filter(p => p.overallProgress >= 100).length
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get student progress",
      details: error.message
    });
  }
}

// Update lesson completion
export async function markLessonComplete(req, res) {
  try {
    const { courseId, moduleId, lessonId } = req.params;
    const { timeSpent } = req.body;
    
    let studentId;
    let student;

    // Check if user is authenticated via JWT
    if (req.user && req.user.email) {
      student = await User.findOne({ email: req.user.email });
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can mark lessons complete" });
      }
      studentId = student._id.toString();
    } else {
      // Fallback: check studentId in request body
      studentId = req.body.studentId;
      if (!studentId) {
        return res.status(403).json({ error: "Student authentication required" });
      }
      
      student = await User.findById(studentId);
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can mark lessons complete" });
      }
    }

    const progress = await Progress.findOne({ student: studentId, course: courseId });
    if (!progress) {
      return res.status(404).json({ error: "Progress record not found" });
    }

    // Find the module
    const moduleIndex = progress.moduleProgress.findIndex(
      m => m.moduleId.toString() === moduleId
    );
    if (moduleIndex === -1) {
      return res.status(404).json({ error: "Module not found in progress" });
    }

    // Add lesson to completed lessons if not already completed
    const module = progress.moduleProgress[moduleIndex];
    if (!module.completedLessons.includes(lessonId)) {
      module.completedLessons.push(lessonId);
    }

    // Update time spent
    if (timeSpent && timeSpent > 0) {
      module.timeSpent += timeSpent;
      progress.totalTimeSpent += timeSpent;
    }

    // Update last accessed
    module.lastAccessed = new Date();

    // Check if module is completed (you might want to get total lessons from course)
    const course = await Course.findById(courseId);
    const courseModule = course.modules.find(m => m._id.toString() === moduleId);
    if (courseModule && module.completedLessons.length >= courseModule.lessons.length) {
      module.completed = true;
    }

    // Update overall progress
    await progress.updateProgress();

    res.status(200).json({
      message: "Lesson marked as complete",
      progress: progress
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to mark lesson complete",
      details: error.message
    });
  }
}

// Update module completion
export async function markModuleComplete(req, res) {
  try {
    const { courseId, moduleId } = req.params;
    
    let studentId;
    let student;

    // Check if user is authenticated via JWT
    if (req.user && req.user.email) {
      student = await User.findOne({ email: req.user.email });
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can mark modules complete" });
      }
      studentId = student._id.toString();
    } else {
      // Fallback: check studentId in request body
      studentId = req.body.studentId;
      if (!studentId) {
        return res.status(403).json({ error: "Student authentication required" });
      }
      
      student = await User.findById(studentId);
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can mark modules complete" });
      }
    }

    const progress = await Progress.findOne({ student: studentId, course: courseId });
    if (!progress) {
      return res.status(404).json({ error: "Progress record not found" });
    }

    // Find and update the module
    const moduleIndex = progress.moduleProgress.findIndex(
      m => m.moduleId.toString() === moduleId
    );
    if (moduleIndex === -1) {
      return res.status(404).json({ error: "Module not found in progress" });
    }

    progress.moduleProgress[moduleIndex].completed = true;
    progress.moduleProgress[moduleIndex].lastAccessed = new Date();

    // Update overall progress
    await progress.updateProgress();

    res.status(200).json({
      message: "Module marked as complete",
      progress: progress
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to mark module complete",
      details: error.message
    });
  }
}

// Add time spent tracking
export async function addTimeSpent(req, res) {
  try {
    const { courseId, moduleId } = req.params;
    const { timeSpent } = req.body; // in minutes
    
    let studentId;
    let student;

    // Check if user is authenticated via JWT
    if (req.user && req.user.email) {
      student = await User.findOne({ email: req.user.email });
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can track time" });
      }
      studentId = student._id.toString();
    } else {
      // Fallback: check studentId in request body
      studentId = req.body.studentId;
      if (!studentId) {
        return res.status(403).json({ error: "Student authentication required" });
      }
      
      student = await User.findById(studentId);
      if (!student || student.role !== 'student') {
        return res.status(403).json({ error: "Only students can track time" });
      }
    }

    if (!timeSpent || timeSpent <= 0) {
      return res.status(400).json({ error: "Valid time spent is required" });
    }

    const progress = await Progress.findOne({ student: studentId, course: courseId });
    if (!progress) {
      return res.status(404).json({ error: "Progress record not found" });
    }

    // Update module time if moduleId provided
    if (moduleId) {
      const moduleIndex = progress.moduleProgress.findIndex(
        m => m.moduleId.toString() === moduleId
      );
      if (moduleIndex !== -1) {
        progress.moduleProgress[moduleIndex].timeSpent += timeSpent;
        progress.moduleProgress[moduleIndex].lastAccessed = new Date();
      }
    }

    // Update total time
    progress.totalTimeSpent += timeSpent;
    progress.lastActivity = new Date();
    
    await progress.save();

    res.status(200).json({
      message: "Time tracking updated",
      totalTimeSpent: progress.totalTimeSpent,
      moduleTimeSpent: moduleId ? progress.moduleProgress.find(m => m.moduleId.toString() === moduleId)?.timeSpent : null
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to update time tracking",
      details: error.message
    });
  }
}

// ==================== INSTRUCTOR/ADMIN FUNCTIONS ====================

// Get course progress statistics (for instructors)
export async function getCourseProgressStats(req, res) {
  try {
    const { courseId } = req.params;
    
    let userId;
    let user;

    // Check if user is authenticated  JWT
    if (req.user && req.user.email) {
      user = await User.findOne({ email: req.user.email });
      if (!user || (user.role !== 'instructor' && user.role !== 'admin')) {
        return res.status(403).json({ error: "Only instructors and admins can view course statistics" });
      }
      userId = user._id.toString();
    } else {
      // Fallback: check userId in request body
      userId = req.body.instructorId || req.body.adminId;
      if (!userId) {
        return res.status(403).json({ error: "Authentication required" });
      }
      
      user = await User.findById(userId);
      if (!user || (user.role !== 'instructor' && user.role !== 'admin')) {
        return res.status(403).json({ error: "Only instructors and admins can view course statistics" });
      }
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if instructor owns this course (skip for admins)
    if (user.role === 'instructor' && course.instructor.toString() !== userId) {
      return res.status(403).json({ error: "You can only view statistics for your own courses" });
    }

    const stats = await Progress.getCourseStats(courseId);
    const detailedProgress = await Progress.find({ course: courseId })
      .populate('student', 'firstName lastName email')
      .sort({ overallProgress: -1 });

    res.status(200).json({
      courseTitle: course.title,
      statistics: stats[0] || {
        totalStudents: 0,
        completedStudents: 0,
        averageProgress: 0,
        totalTimeSpent: 0
      },
      studentProgress: detailedProgress
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get course statistics",
      details: error.message
    });
  }
}

// Get all students progress for an instructor's courses
export async function getInstructorCoursesProgress(req, res) {
  try {
    let instructorId;
    let instructor;

    // Check if user is authenticated  JWT
    if (req.user && req.user.email) {
      instructor = await User.findOne({ email: req.user.email });
      if (!instructor || instructor.role !== 'instructor') {
        return res.status(403).json({ error: "Only instructors can view this data" });
      }
      instructorId = instructor._id.toString();
    } else {
      // Fallback: check instructorId in params
      instructorId = req.params.instructorId;
      if (!instructorId) {
        return res.status(403).json({ error: "Instructor authentication required" });
      }
      
      instructor = await User.findById(instructorId);
      if (!instructor || instructor.role !== 'instructor') {
        return res.status(403).json({ error: "Only instructors can view this data" });
      }
    }

    // Get instructor's courses
    const courses = await Course.find({ instructor: instructorId }).select('_id title');
    const courseIds = courses.map(course => course._id);

    // Get progress for all these courses
    const progressData = await Progress.find({ course: { $in: courseIds } })
      .populate('student', 'firstName lastName email')
      .populate('course', 'title')
      .sort({ lastActivity: -1 });

    res.status(200).json({
      instructor: {
        _id: instructor._id,
        firstName: instructor.firstName,
        lastName: instructor.lastName
      },
      courses: courses,
      progressData: progressData,
      summary: {
        totalCourses: courses.length,
        totalStudents: progressData.length,
        completedEnrollments: progressData.filter(p => p.overallProgress >= 100).length
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get instructor courses progress",
      details: error.message
    });
  }
}
