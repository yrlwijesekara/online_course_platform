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

    // Add course to instructor's created courses
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
    const { instructorId, ...updateData } = req.body;
    
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const instructor = await User.findById(instructorId);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(403).json({ error: "Only instructors can update courses" });
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
    const { instructorId, moduleIndex, lesson } = req.body;
    
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

    // Add lesson to the specified module
    if (course.modules[moduleIndex]) {
      course.modules[moduleIndex].lessons.push(lesson);
    } else {
      return res.status(400).json({ error: "Invalid module index" });
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
