import Certificate from '../models/certificate.js';
import Course from '../models/course.js';
import User from '../models/user.js';
import Progress from '../models/progress.js';

// Generate certificate for completed course
export const generateCertificate = async (req, res) => {
  try {
    const { courseId, studentId } = req.body;
    const generatedBy = req.user._id;

    // Validate required fields
    if (!courseId || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Course ID and Student ID are required'
      });
    }

    // Check if certificate already exists
    const existingCertificate = await Certificate.findOne({
      student: studentId,
      course: courseId
    });

    if (existingCertificate) {
      return res.status(400).json({
        success: false,
        message: 'Certificate already exists for this student and course',
        certificate: existingCertificate
      });
    }

    // Get course details
    const course = await Course.findById(courseId).populate('instructor', 'firstName lastName');
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Get student details
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Check if student has completed the course
    const progress = await Progress.findOne({
      user: studentId,
      course: courseId
    });

    if (!progress || progress.completionPercentage < 100) {
      return res.status(400).json({
        success: false,
        message: 'Student has not completed the course yet',
        currentProgress: progress ? progress.completionPercentage : 0
      });
    }

    // Get enrollment date
    const enrollmentDate = progress.enrolledAt || progress.createdAt;

    // Calculate course duration
    const courseDurationHours = course.duration || 10; // Default 10 hours
    const courseDurationWeeks = Math.ceil(courseDurationHours / 40); // Assuming 40 hours per week

    // Create certificate
    const certificate = new Certificate({
      student: studentId,
      course: courseId,
      instructor: course.instructor._id,
      studentName: `${student.firstName} ${student.lastName}`,
      courseName: course.title,
      instructorName: `${course.instructor.firstName} ${course.instructor.lastName}`,
      completionDate: progress.completedAt || new Date(),
      enrollmentDate: enrollmentDate,
      courseDuration: {
        hours: courseDurationHours,
        weeks: courseDurationWeeks
      },
      performance: {
        finalScore: progress.finalScore || 85,
        totalAssignments: progress.totalAssignments || 0,
        completedAssignments: progress.completedAssignments || 0,
        totalQuizzes: progress.totalQuizzes || 0,
        completedQuizzes: progress.completedQuizzes || 0,
        avgQuizScore: progress.avgQuizScore || 0,
        avgAssignmentScore: progress.avgAssignmentScore || 0
      },
      skills: course.skills || [],
      issuer: {
        organizationName: 'Online Course Platform',
        organizationUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
      }
    });

    // Generate verification code and certificate number
    certificate.generateVerificationCode();
    certificate.generateCertificateNumber();

    // Issue the certificate
    await certificate.issueCertificate();

    // Populate the certificate data
    const populatedCertificate = await Certificate.findById(certificate._id)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title category level')
      .populate('instructor', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Certificate generated successfully',
      certificate: populatedCertificate
    });

  } catch (error) {
    console.error('Error generating certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate certificate',
      error: error.message
    });
  }
};

// Auto-generate certificate when course is completed
export const autoGenerateCertificate = async (studentId, courseId, progressData) => {
  try {
    // Check if certificate already exists
    const existingCertificate = await Certificate.findOne({
      student: studentId,
      course: courseId
    });

    if (existingCertificate) {
      return existingCertificate;
    }

    // Get course and student data
    const [course, student] = await Promise.all([
      Course.findById(courseId).populate('instructor', 'firstName lastName'),
      User.findById(studentId)
    ]);

    if (!course || !student) {
      throw new Error('Course or student not found');
    }

    // Create certificate automatically
    const certificate = new Certificate({
      student: studentId,
      course: courseId,
      instructor: course.instructor._id,
      studentName: `${student.firstName} ${student.lastName}`,
      courseName: course.title,
      instructorName: `${course.instructor.firstName} ${course.instructor.lastName}`,
      completionDate: new Date(),
      enrollmentDate: progressData.enrolledAt || progressData.createdAt,
      courseDuration: {
        hours: course.duration || 10,
        weeks: Math.ceil((course.duration || 10) / 40)
      },
      performance: {
        finalScore: progressData.finalScore || 85,
        totalAssignments: progressData.totalAssignments || 0,
        completedAssignments: progressData.completedAssignments || 0,
        totalQuizzes: progressData.totalQuizzes || 0,
        completedQuizzes: progressData.completedQuizzes || 0,
        avgQuizScore: progressData.avgQuizScore || 0,
        avgAssignmentScore: progressData.avgAssignmentScore || 0
      },
      skills: course.skills || [],
      issuer: {
        organizationName: 'Online Course Platform',
        organizationUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
      }
    });

    // Generate verification code and certificate number
    certificate.generateVerificationCode();
    certificate.generateCertificateNumber();

    // Issue the certificate
    await certificate.issueCertificate();

    return certificate;

  } catch (error) {
    console.error('Error auto-generating certificate:', error);
    throw error;
  }
};

// Get student's certificates
export const getStudentCertificates = async (req, res) => {
  try {
    const studentId = req.params.studentId || req.user._id;
    const { status, limit = 10, page = 1 } = req.query;

    const certificates = await Certificate.findByStudent(studentId, {
      status,
      limit: parseInt(limit),
      page: parseInt(page)
    });

    const totalCertificates = await Certificate.countDocuments({
      student: studentId,
      ...(status && { status })
    });

    res.status(200).json({
      success: true,
      message: 'Certificates retrieved successfully',
      certificates,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCertificates / parseInt(limit)),
        totalCertificates,
        hasNext: page * limit < totalCertificates,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error getting student certificates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificates',
      error: error.message
    });
  }
};

// Get specific certificate
export const getCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;

    const certificate = await Certificate.findById(certificateId)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title description category level')
      .populate('instructor', 'firstName lastName');

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    // Track view
    await certificate.trackView();

    res.status(200).json({
      success: true,
      message: 'Certificate retrieved successfully',
      certificate
    });

  } catch (error) {
    console.error('Error getting certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificate',
      error: error.message
    });
  }
};

// Verify certificate
export const verifyCertificate = async (req, res) => {
  try {
    const { verificationCode } = req.params;

    const certificate = await Certificate.verifyCertificate(verificationCode);

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found or invalid verification code'
      });
    }

    // Track verification
    certificate.analytics.verificationCount += 1;
    await certificate.save();

    res.status(200).json({
      success: true,
      message: 'Certificate verified successfully',
      certificate: {
        certificateId: certificate.certificateId,
        certificateNumber: certificate.certificateNumber,
        studentName: certificate.studentName,
        courseName: certificate.courseName,
        instructorName: certificate.instructorName,
        completionDate: certificate.completionDate,
        issuedDate: certificate.issuedDate,
        status: certificate.status,
        performance: certificate.performance,
        issuer: certificate.issuer
      }
    });

  } catch (error) {
    console.error('Error verifying certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify certificate',
      error: error.message
    });
  }
};

// Download certificate
export const downloadCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { format = 'pdf' } = req.query;

    const certificate = await Certificate.findById(certificateId)
      .populate('student', 'firstName lastName')
      .populate('course', 'title')
      .populate('instructor', 'firstName lastName');

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    // Check if user is authorized to download this certificate
    if (certificate.student._id.toString() !== req.user._id.toString() && 
        certificate.instructor._id.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to download this certificate'
      });
    }

    // Track download
    await certificate.trackDownload();

    // TODO: Implement PDF/Image generation logic here
    // For now, return certificate data that can be used to generate PDF on frontend
    
    res.status(200).json({
      success: true,
      message: 'Certificate download data retrieved',
      certificate: {
        certificateId: certificate.certificateId,
        certificateNumber: certificate.certificateNumber,
        studentName: certificate.studentName,
        courseName: certificate.courseName,
        instructorName: certificate.instructorName,
        completionDate: certificate.completionDate,
        issuedDate: certificate.issuedDate,
        performance: certificate.performance,
        template: certificate.template,
        verification: {
          verificationCode: certificate.verification.verificationCode,
          verificationUrl: certificate.verification.verificationUrl
        },
        issuer: certificate.issuer
      },
      downloadFormat: format
    });

  } catch (error) {
    console.error('Error downloading certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download certificate',
      error: error.message
    });
  }
};

// Get all certificates (admin only)
export const getAllCertificates = async (req, res) => {
  try {
    const { 
      status, 
      course, 
      student, 
      instructor,
      limit = 10, 
      page = 1,
      sortBy = 'issuedDate',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    let query = {};
    if (status) query.status = status;
    if (course) query.course = course;
    if (student) query.student = student;
    if (instructor) query.instructor = instructor;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const certificates = await Certificate.find(query)
      .populate('student', 'firstName lastName email')
      .populate('course', 'title category level')
      .populate('instructor', 'firstName lastName')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalCertificates = await Certificate.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'Certificates retrieved successfully',
      certificates,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCertificates / parseInt(limit)),
        totalCertificates,
        hasNext: page * limit < totalCertificates,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error getting all certificates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificates',
      error: error.message
    });
  }
};

// Revoke certificate (admin/instructor only)
export const revokeCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { reason } = req.body;

    const certificate = await Certificate.findById(certificateId);

    if (!certificate) {
      return res.status(404).json({
        success: false,
        message: 'Certificate not found'
      });
    }

    // Check authorization
    if (certificate.instructor.toString() !== req.user._id.toString() && 
        req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to revoke this certificate'
      });
    }

    await certificate.revokeCertificate(reason || 'Revoked by administrator');

    res.status(200).json({
      success: true,
      message: 'Certificate revoked successfully',
      certificate
    });

  } catch (error) {
    console.error('Error revoking certificate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke certificate',
      error: error.message
    });
  }
};

// Get certificate analytics
export const getCertificateAnalytics = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get analytics data
    const [
      totalCertificates,
      issuedCertificates,
      revokedCertificates,
      recentCertificates,
      popularCourses,
      topPerformers
    ] = await Promise.all([
      Certificate.countDocuments(),
      Certificate.countDocuments({ status: 'issued' }),
      Certificate.countDocuments({ status: 'revoked' }),
      Certificate.countDocuments({ 
        issuedDate: { $gte: startDate },
        status: 'issued'
      }),
      Certificate.aggregate([
        { $match: { status: 'issued' } },
        { $group: { 
            _id: '$course', 
            count: { $sum: 1 },
            avgScore: { $avg: '$performance.finalScore' }
        }},
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $lookup: {
            from: 'courses',
            localField: '_id',
            foreignField: '_id',
            as: 'courseInfo'
        }},
        { $unwind: '$courseInfo' },
        { $project: {
            courseName: '$courseInfo.title',
            certificateCount: '$count',
            averageScore: { $round: ['$avgScore', 2] }
        }}
      ]),
      Certificate.aggregate([
        { $match: { status: 'issued' } },
        { $sort: { 'performance.finalScore': -1 } },
        { $limit: 10 },
        { $lookup: {
            from: 'users',
            localField: 'student',
            foreignField: '_id',
            as: 'studentInfo'
        }},
        { $unwind: '$studentInfo' },
        { $project: {
            studentName: { $concat: ['$studentInfo.firstName', ' ', '$studentInfo.lastName'] },
            courseName: 1,
            finalScore: '$performance.finalScore',
            grade: '$performance.grade',
            issuedDate: 1
        }}
      ])
    ]);

    res.status(200).json({
      success: true,
      message: 'Certificate analytics retrieved successfully',
      analytics: {
        overview: {
          totalCertificates,
          issuedCertificates,
          revokedCertificates,
          recentCertificates,
          issuanceRate: totalCertificates > 0 ? ((issuedCertificates / totalCertificates) * 100).toFixed(2) : 0
        },
        popularCourses,
        topPerformers,
        timeframe
      }
    });

  } catch (error) {
    console.error('Error getting certificate analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificate analytics',
      error: error.message
    });
  }
};
