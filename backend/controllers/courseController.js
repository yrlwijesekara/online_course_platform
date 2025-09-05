import Course from "../models/course.js";
import User from "../models/user.js";

// ==================== COURSE MANAGEMENT ====================

// Create course (Instructor function)
export async function createCourse(req, res) {
  try {
    const { title, description, category, level, duration, pricing, instructorId } = req.body;
    
    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can create courses" });
    }

    const newCourse = new Course({
      title,
      description,
      category,
      level,
      duration,
      pricing,
      instructor: instructorId,
      instructorName: `${instructor.firstName} ${instructor.lastName}`,
      status: 'draft'
    });

    const savedCourse = await newCourse.save();

    // Add course to instructor's created courses (initialize if undefined)
    if (!instructor.createdCourses) {
      instructor.createdCourses = [];
    }
    instructor.createdCourses.push(savedCourse._id);
    await instructor.save();

    res.status(201).json({
      message: "Course created successfully",
      course: savedCourse
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create course",
      details: error.message
    });
  }
}

// Get all courses
export async function getAllCourses(req, res) {
  try {
    const { category, level, status, page = 1, limit = 10 } = req.query;
    
    let filter = {};
    if (category) filter.category = category;
    if (level) filter.level = level;
    if (status) filter.status = status;
    else filter.status = 'published'; // Default to published courses

    const courses = await Course.find(filter)
      .populate('instructor', 'firstName lastName email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Course.countDocuments(filter);

    res.status(200).json({
      message: "Courses retrieved successfully",
      courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get courses",
      details: error.message
    });
  }
}

// Get course by ID
export async function getCourseById(req, res) {
  try {
    const { courseId } = req.params;
    
    const course = await Course.findById(courseId)
      .populate('instructor', 'firstName lastName email bio')
      .populate('enrolledStudents.student', 'firstName lastName');

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.status(200).json({
      message: "Course retrieved successfully",
      course
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get course",
      details: error.message
    });
  }
}

// Update course (Instructor function)
export async function updateCourse(req, res) {
  try {
    const { courseId } = req.params;
    const updateData = req.body;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    let instructorId;
    let instructor;

    // Check if user is authenticated via JWT
    if (req.user && req.user.email) {
      instructor = await User.findOne({ email: req.user.email });
      if (!instructor || instructor.role !== 'instructor') {
        return res.status(403).json({ error: "Only instructors can update courses" });
      }
      instructorId = instructor._id.toString();
    } else {
      // Fallback: check instructorId in request body
      instructorId = req.body.instructorId;
      if (!instructorId) {
        return res.status(403).json({ error: "Instructor authentication required" });
      }
      
      instructor = await User.findById(instructorId);
      if (!instructor || instructor.role !== 'instructor') {
        return res.status(403).json({ error: "Only instructors can update courses" });
      }
      
      // Remove instructorId from updateData since it shouldn't be updated
      delete updateData.instructorId;
    }

    // Check if instructor owns this course
    if (course.instructor.toString() !== instructorId) {
      return res.status(403).json({ error: "You can only update your own courses" });
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      courseId,
      { ...updateData, lastUpdated: new Date() },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: "Course updated successfully",
      course: updatedCourse
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to update course",
      details: error.message
    });
  }
}

// Delete course (Instructor function)
export async function deleteCourse(req, res) {
  try {
    const { courseId } = req.params;
    const { instructorId } = req.body;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can delete courses" });
    }

    // Check if instructor owns this course
    if (course.instructor.toString() !== instructorId) {
      return res.status(403).json({ error: "You can only delete your own courses" });
    }

    await Course.findByIdAndDelete(courseId);

    // Remove course from instructor's created courses
    instructor.createdCourses = instructor.createdCourses.filter(
      id => id.toString() !== courseId
    );
    await instructor.save();

    res.status(200).json({
      message: "Course deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to delete course",
      details: error.message
    });
  }
}

// ==================== COURSE CONTENT MANAGEMENT ====================

// Upload content to course (Instructor function)
export async function uploadContent(req, res) {
  try {
    const { courseId } = req.params;
    const { instructorId, moduleIndex, content, contentType } = req.body;
    
    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can upload content" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if instructor owns this course
    if (course.instructor.toString() !== instructorId) {
      return res.status(403).json({ error: "You can only upload content to your own courses" });
    }

    // Initialize modules array if it doesn't exist
    if (!course.modules) {
      course.modules = [];
    }

    // Create module if it doesn't exist
    if (!course.modules[moduleIndex]) {
      // Create modules up to the specified index
      for (let i = course.modules.length; i <= moduleIndex; i++) {
        course.modules.push({
          title: `Module ${i + 1}`,
          description: `Module ${i + 1} description`,
          order: i + 1,
          lessons: []
        });
      }
    }

    const moduleId = course.modules[moduleIndex]._id;

    // Handle different content types
    if (contentType === 'quiz') {
      // Add to quizzes array
      const quiz = {
        ...content,
        moduleId: moduleId
      };
      course.quizzes.push(quiz);
    } else if (contentType === 'assignment') {
      // Add to assignments array
      const assignment = {
        ...content,
        moduleId: moduleId
      };
      course.assignments.push(assignment);
    } else {
      // Add as regular lesson to the specified module
      const lesson = {
        ...content,
        contentType: contentType || 'text'
      };
      course.modules[moduleIndex].lessons.push(lesson);
    }

    await course.save();

    res.status(201).json({
      message: "Content uploaded successfully",
      course
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to upload content",
      details: error.message
    });
  }
}

// ==================== STUDENT COURSE FUNCTIONS ====================

// Enroll in a course (Student function)
export async function enrollInCourse(req, res) {
  try {
    const { courseId } = req.params;
    const { studentId } = req.body;
    
    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: "Only students can enroll in courses" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.status !== 'published') {
      return res.status(400).json({ error: "Course is not available for enrollment" });
    }

    // Check if already enrolled
    const alreadyEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === studentId
    );
    if (alreadyEnrolled) {
      return res.status(400).json({ error: "Already enrolled in this course" });
    }

    // Add student to course enrollment
    course.enrolledStudents.push({
      student: studentId,
      enrolledAt: new Date(),
      progress: 0
    });
    
    // Update course stats
    course.stats.totalEnrollments += 1;
    course.stats.activeStudents += 1;

    await course.save();

    // Add course to student's enrolled courses
    student.enrolledCourses.push({
      courseId: courseId,
      enrollmentDate: new Date(),
      progress: 0
    });
    await student.save();

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

// Get student's enrolled courses
export async function getStudentCourses(req, res) {
  try {
    const { studentId } = req.params;
    
    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: "Invalid student" });
    }

    const enrolledCourses = await Course.find({
      'enrolledStudents.student': studentId
    }).populate('instructor', 'firstName lastName');

    res.status(200).json({
      message: "Student courses retrieved successfully",
      courses: enrolledCourses
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get student courses",
      details: error.message
    });
  }
}

// Track course progress (Student function)
export async function trackProgress(req, res) {
  try {
    const { courseId } = req.params;
    const { studentId } = req.query;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const enrollment = course.enrolledStudents.find(
      enrollment => enrollment.student.toString() === studentId
    );
    if (!enrollment) {
      return res.status(404).json({ error: "Not enrolled in this course" });
    }

    res.status(200).json({
      courseId: courseId,
      progress: enrollment.progress,
      enrollmentDate: enrollment.enrolledAt,
      completed: enrollment.completed,
      completionDate: enrollment.completedAt,
      lastAccessed: enrollment.lastAccessedAt
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get progress",
      details: error.message
    });
  }
}

// ==================== COURSE REVIEWS ====================

// Add course review
export async function addCourseReview(req, res) {
  try {
    const { courseId } = req.params;
    const { studentId, rating, comment } = req.body;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(403).json({ error: "Only students can review courses" });
    }

    // Check if student is enrolled
    const isEnrolled = course.enrolledStudents.some(
      enrollment => enrollment.student.toString() === studentId
    );
    if (!isEnrolled) {
      return res.status(403).json({ error: "You must be enrolled to review this course" });
    }

    // Check if already reviewed
    const existingReview = course.reviews.find(
      review => review.student.toString() === studentId
    );
    if (existingReview) {
      return res.status(400).json({ error: "You have already reviewed this course" });
    }

    // Add review
    course.reviews.push({
      student: studentId,
      rating,
      comment
    });

    // Update course stats
    const totalRating = course.reviews.reduce((sum, review) => sum + review.rating, 0);
    course.stats.averageRating = totalRating / course.reviews.length;
    course.stats.totalReviews = course.reviews.length;

    await course.save();

    res.status(201).json({
      message: "Review added successfully",
      review: course.reviews[course.reviews.length - 1]
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to add review",
      details: error.message
    });
  }
}

// ==================== QUIZ MANAGEMENT ====================

// Create a quiz for a specific module
export async function createQuiz(req, res) {
  try {
    const { courseId } = req.params;
    const { instructorId, moduleIndex, quiz } = req.body;
    
    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can create quizzes" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if instructor owns this course
    if (course.instructor.toString() !== instructorId) {
      return res.status(403).json({ error: "You can only create quizzes for your own courses" });
    }

    // Validate module exists
    if (!course.modules[moduleIndex]) {
      return res.status(400).json({ error: "Module does not exist" });
    }

    const moduleId = course.modules[moduleIndex]._id;

    // Create quiz
    const newQuiz = {
      ...quiz,
      moduleId: moduleId
    };

    course.quizzes.push(newQuiz);
    await course.save();

    res.status(201).json({
      message: "Quiz created successfully",
      quiz: course.quizzes[course.quizzes.length - 1]
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create quiz",
      details: error.message
    });
  }
}

// Get quizzes for a specific module
export async function getModuleQuizzes(req, res) {
  try {
    const { courseId, moduleIndex } = req.params;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (!course.modules[moduleIndex]) {
      return res.status(400).json({ error: "Module does not exist" });
    }

    const moduleId = course.modules[moduleIndex]._id;
    const moduleQuizzes = course.quizzes.filter(quiz => 
      quiz.moduleId.toString() === moduleId.toString()
    );

    res.status(200).json({
      quizzes: moduleQuizzes,
      module: course.modules[moduleIndex]
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get quizzes",
      details: error.message
    });
  }
}

// ==================== ASSIGNMENT MANAGEMENT ====================

// Create an assignment for a specific module
export async function createAssignment(req, res) {
  try {
    const { courseId } = req.params;
    const { instructorId, moduleIndex, assignment } = req.body;
    
    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can create assignments" });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if instructor owns this course
    if (course.instructor.toString() !== instructorId) {
      return res.status(403).json({ error: "You can only create assignments for your own courses" });
    }

    // Validate module exists
    if (!course.modules[moduleIndex]) {
      return res.status(400).json({ error: "Module does not exist" });
    }

    const moduleId = course.modules[moduleIndex]._id;

    // Create assignment
    const newAssignment = {
      ...assignment,
      moduleId: moduleId
    };

    course.assignments.push(newAssignment);
    await course.save();

    res.status(201).json({
      message: "Assignment created successfully",
      assignment: course.assignments[course.assignments.length - 1]
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to create assignment",
      details: error.message
    });
  }
}

// Get assignments for a specific module
export async function getModuleAssignments(req, res) {
  try {
    const { courseId, moduleIndex } = req.params;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (!course.modules[moduleIndex]) {
      return res.status(400).json({ error: "Module does not exist" });
    }

    const moduleId = course.modules[moduleIndex]._id;
    const moduleAssignments = course.assignments.filter(assignment => 
      assignment.moduleId.toString() === moduleId.toString()
    );

    res.status(200).json({
      assignments: moduleAssignments,
      module: course.modules[moduleIndex]
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get assignments",
      details: error.message
    });
  }
}
