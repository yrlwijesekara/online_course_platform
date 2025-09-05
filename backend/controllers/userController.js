import User from "../models/user.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

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
      }, "secret", { expiresIn: "1h" });

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

// ==================== STUDENT FUNCTIONS ====================

// Enroll in a course
export async function enrollInCourse(req, res) {
  try {
    const { courseId } = req.params;
    const { userId } = req.body; // or get from JWT token: req.user.id
    
    const user = await User.findById(userId);
    if (!user || user.role !== 'student') {
      return res.status(403).json({ error: "Only students can enroll in courses" });
    }

    // Check if already enrolled
    const alreadyEnrolled = user.enrolledCourses.some(course => course.courseId.toString() === courseId);
    if (alreadyEnrolled) {
      return res.status(400).json({ error: "Already enrolled in this course" });
    }

    // Add course to enrolled courses
    user.enrolledCourses.push({
      courseId: courseId,
      enrollmentDate: new Date(),
      progress: 0
    });

    await user.save();

    res.status(200).json({
      message: "Successfully enrolled in course",
      courseId: courseId
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to enroll in course",
      details: error.message
    });
  }
}

// Submit assignment
export async function submitAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    const { userId, submissionText, fileUrl } = req.body;
    
    const user = await User.findById(userId);
    if (!user || user.role !== 'student') {
      return res.status(403).json({ error: "Only students can submit assignments" });
    }

    // Here you would typically save to an Assignment/Submission model
    // For now, we'll simulate a submission
    const submission = {
      assignmentId,
      studentId: userId,
      submissionText,
      fileUrl,
      submittedAt: new Date(),
      status: 'submitted'
    };

    res.status(200).json({
      message: "Assignment submitted successfully",
      submission: submission
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to submit assignment",
      details: error.message
    });
  }
}

// Track progress
export async function trackProgress(req, res) {
  try {
    const { courseId } = req.params;
    const { userId } = req.query;
    
    const user = await User.findById(userId);
    if (!user || user.role !== 'student') {
      return res.status(403).json({ error: "Only students can track progress" });
    }

    const enrolledCourse = user.enrolledCourses.find(course => course.courseId.toString() === courseId);
    if (!enrolledCourse) {
      return res.status(404).json({ error: "Not enrolled in this course" });
    }

    res.status(200).json({
      courseId: courseId,
      progress: enrolledCourse.progress,
      enrollmentDate: enrolledCourse.enrollmentDate,
      completed: enrolledCourse.completed,
      completionDate: enrolledCourse.completionDate
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get progress",
      details: error.message
    });
  }
}

// ==================== INSTRUCTOR FUNCTIONS ====================

// Create course
export async function createCourse(req, res) {
  try {
    const { title, description, duration, price, instructorId } = req.body;
    
    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can create courses" });
    }

    // Here you would typically save to a Course model
    // For now, we'll simulate course creation
    const newCourse = {
      id: new Date().getTime().toString(), // Temporary ID
      title,
      description,
      duration,
      price,
      instructorId,
      createdAt: new Date(),
      status: 'active'
    };

    // Add course to instructor's created courses
    instructor.createdCourses.push(newCourse.id);
    await instructor.save();

    res.status(201).json({
      message: "Course created successfully",
      course: newCourse
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create course",
      details: error.message
    });
  }
}

// Upload content
export async function uploadContent(req, res) {
  try {
    const { courseId } = req.params;
    const { instructorId, contentType, title, url, description } = req.body;
    
    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can upload content" });
    }

    // Check if instructor owns this course
    if (!instructor.createdCourses.includes(courseId)) {
      return res.status(403).json({ error: "You can only upload content to your own courses" });
    }

    // Here you would typically save to a CourseContent model
    const content = {
      id: new Date().getTime().toString(),
      courseId,
      contentType, // 'video', 'document', 'quiz', etc.
      title,
      url,
      description,
      uploadedAt: new Date()
    };

    res.status(201).json({
      message: "Content uploaded successfully",
      content: content
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to upload content",
      details: error.message
    });
  }
}

// Evaluate students
export async function evaluateStudents(req, res) {
  try {
    const { studentId, assignmentId } = req.params;
    const { instructorId, grade, feedback } = req.body;
    
    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can evaluate students" });
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: "Student not found" });
    }

    // Here you would typically save to an Evaluation/Grade model
    const evaluation = {
      assignmentId,
      studentId,
      instructorId,
      grade,
      feedback,
      evaluatedAt: new Date()
    };

    res.status(200).json({
      message: "Student evaluated successfully",
      evaluation: evaluation
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to evaluate student",
      details: error.message
    });
  }
}

// ==================== ADMIN FUNCTIONS ====================

// Manage users
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

// Monitor activity
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

// Handle payments
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
