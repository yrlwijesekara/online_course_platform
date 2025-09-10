import mongoose from "mongoose";

// Certificate Schema
const certificateSchema = new mongoose.Schema({
  // Certificate Identification
  certificateId: {
    type: String,
    required: [true, 'Certificate ID is required'],
    unique: true,
    trim: true
  },
  certificateNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Student and Course Information
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Student is required']
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: [true, 'Course is required']
  },
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Instructor is required']
  },
  
  // Certificate Details
  studentName: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true
  },
  courseName: {
    type: String,
    required: [true, 'Course name is required'],
    trim: true
  },
  instructorName: {
    type: String,
    required: [true, 'Instructor name is required'],
    trim: true
  },
  
  // Completion Information
  completionDate: {
    type: Date,
    required: [true, 'Completion date is required'],
    default: Date.now
  },
  enrollmentDate: {
    type: Date,
    required: [true, 'Enrollment date is required']
  },
  courseDuration: {
    hours: {
      type: Number,
      required: true
    },
    weeks: {
      type: Number,
      default: 0
    }
  },
  
  // Performance Metrics
  performance: {
    finalScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    grade: {
      type: String,
      enum: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F', 'Pass', 'Fail'],
      default: 'Pass'
    },
    totalAssignments: {
      type: Number,
      default: 0
    },
    completedAssignments: {
      type: Number,
      default: 0
    },
    totalQuizzes: {
      type: Number,
      default: 0
    },
    completedQuizzes: {
      type: Number,
      default: 0
    },
    avgQuizScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    avgAssignmentScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  
  // Certificate Status
  status: {
    type: String,
    enum: ['pending', 'issued', 'revoked', 'expired'],
    default: 'pending'
  },
  issuedDate: {
    type: Date
  },
  expiryDate: {
    type: Date
  },
  
  // Certificate Template and Design
  template: {
    templateId: {
      type: String,
      default: 'default'
    },
    backgroundColor: {
      type: String,
      default: '#ffffff'
    },
    textColor: {
      type: String,
      default: '#000000'
    },
    borderColor: {
      type: String,
      default: '#cccccc'
    },
    logoUrl: String,
    signatureUrl: String
  },
  
  // Certificate Files
  files: {
    pdfUrl: String,
    imageUrl: String,
    originalSize: Number,
    thumbnailUrl: String
  },
  
  // Verification
  verification: {
    verificationCode: {
      type: String,
      unique: true,
      sparse: true
    },
    qrCodeUrl: String,
    verificationUrl: String,
    isVerifiable: {
      type: Boolean,
      default: true
    }
  },
  
  // Additional Information
  skills: [{
    type: String,
    trim: true
  }],
  competencies: [{
    name: String,
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert']
    }
  }],
  
  // Metadata
  issuer: {
    organizationName: {
      type: String,
      default: 'Online Course Platform'
    },
    organizationLogo: String,
    organizationUrl: String,
    accreditationInfo: String
  },
  
  // Analytics
  analytics: {
    viewCount: {
      type: Number,
      default: 0
    },
    downloadCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    },
    verificationCount: {
      type: Number,
      default: 0
    },
    lastViewed: Date,
    lastDownloaded: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
certificateSchema.index({ student: 1, course: 1 }, { unique: true });
certificateSchema.index({ status: 1, issuedDate: -1 });
certificateSchema.index({ student: 1, status: 1 });

// Virtual for certificate age
certificateSchema.virtual('certificateAge').get(function() {
  return this.issuedDate ? Date.now() - this.issuedDate.getTime() : null;
});

// Virtual for course completion percentage
certificateSchema.virtual('completionPercentage').get(function() {
  const totalItems = this.performance.totalAssignments + this.performance.totalQuizzes;
  const completedItems = this.performance.completedAssignments + this.performance.completedQuizzes;
  return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
});

// Virtual for overall performance
certificateSchema.virtual('overallPerformance').get(function() {
  const quizWeight = 0.4;
  const assignmentWeight = 0.6;
  return Math.round(
    (this.performance.avgQuizScore * quizWeight) + 
    (this.performance.avgAssignmentScore * assignmentWeight)
  );
});

// Method to generate certificate number
certificateSchema.methods.generateCertificateNumber = function() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  this.certificateNumber = `CERT-${year}${month}-${random}`;
  return this.certificateNumber;
};

// Method to generate verification code
certificateSchema.methods.generateVerificationCode = function() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  this.verification.verificationCode = `${timestamp}${random}`.toUpperCase();
  this.verification.verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify/${this.verification.verificationCode}`;
  return this.verification.verificationCode;
};

// Method to issue certificate
certificateSchema.methods.issueCertificate = function() {
  this.status = 'issued';
  this.issuedDate = new Date();
  
  // Generate certificate number if not exists
  if (!this.certificateNumber) {
    this.generateCertificateNumber();
  }
  
  // Generate verification code if not exists
  if (!this.verification.verificationCode) {
    this.generateVerificationCode();
  }
  
  return this.save();
};

// Method to revoke certificate
certificateSchema.methods.revokeCertificate = function(reason) {
  this.status = 'revoked';
  this.metadata = { ...this.metadata, revocationReason: reason, revokedAt: new Date() };
  return this.save();
};

// Method to track view
certificateSchema.methods.trackView = function() {
  this.analytics.viewCount += 1;
  this.analytics.lastViewed = new Date();
  return this.save();
};

// Method to track download
certificateSchema.methods.trackDownload = function() {
  this.analytics.downloadCount += 1;
  this.analytics.lastDownloaded = new Date();
  return this.save();
};

// Static method to find certificates by student
certificateSchema.statics.findByStudent = function(studentId, options = {}) {
  const { status, limit = 10, page = 1 } = options;
  let query = { student: studentId };
  
  if (status) {
    query.status = status;
  }
  
  return this.find(query)
    .populate('course', 'title category level')
    .populate('instructor', 'firstName lastName')
    .sort({ issuedDate: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
};

// Static method to verify certificate
certificateSchema.statics.verifyCertificate = function(verificationCode) {
  return this.findOne({ 
    'verification.verificationCode': verificationCode.toUpperCase(),
    status: 'issued',
    'verification.isVerifiable': true
  }).populate('student', 'firstName lastName email')
    .populate('course', 'title description')
    .populate('instructor', 'firstName lastName');
};

// Pre-save middleware
certificateSchema.pre('save', function(next) {
  // Auto-generate certificate ID if not provided
  if (!this.certificateId) {
    this.certificateId = `CERT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Calculate final score if not provided
  if (!this.performance.finalScore && this.performance.avgQuizScore && this.performance.avgAssignmentScore) {
    this.performance.finalScore = this.overallPerformance;
  }
  
  // Determine grade based on final score
  if (this.performance.finalScore >= 95) this.performance.grade = 'A+';
  else if (this.performance.finalScore >= 90) this.performance.grade = 'A';
  else if (this.performance.finalScore >= 85) this.performance.grade = 'A-';
  else if (this.performance.finalScore >= 80) this.performance.grade = 'B+';
  else if (this.performance.finalScore >= 75) this.performance.grade = 'B';
  else if (this.performance.finalScore >= 70) this.performance.grade = 'B-';
  else if (this.performance.finalScore >= 65) this.performance.grade = 'C+';
  else if (this.performance.finalScore >= 60) this.performance.grade = 'C';
  else if (this.performance.finalScore >= 55) this.performance.grade = 'C-';
  else if (this.performance.finalScore >= 50) this.performance.grade = 'D';
  else this.performance.grade = 'F';
  
  next();
});

const Certificate = mongoose.model('Certificate', certificateSchema);

export default Certificate;
