import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema({
  student: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Student is required'] 
  },
  assignment: {
    assignmentId: { 
      type: mongoose.Schema.Types.ObjectId, 
      required: [true, 'Assignment ID is required'] 
    },
    title: String,
    maxPoints: Number
  },
  course: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course', 
    required: [true, 'Course is required'] 
  },
  submissionType: { 
    type: String, 
    enum: ['text', 'file', 'url', 'both'], 
    required: [true, 'Submission type is required'] 
  },
  content: {
    textContent: String,
    files: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      fileSize: Number
    }],
    urls: [String],
    comments: String
  },
  submittedAt: { 
    type: Date, 
    default: Date.now 
  },
  isLate: { 
    type: Boolean, 
    default: false 
  },
  attemptNumber: { 
    type: Number, 
    default: 1,
    min: [1, 'Attempt number must be at least 1']
  },
  grade: {
    score: {
      type: Number,
      min: [0, 'Score cannot be negative']
    },
    maxScore: {
      type: Number,
      min: [0, 'Max score cannot be negative']
    },
    percentage: {
      type: Number,
      min: [0, 'Percentage cannot be less than 0'],
      max: [100, 'Percentage cannot exceed 100']
    },
    letterGrade: {
      type: String,
      enum: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F']
    },
    feedback: String,
    rubricScores: [{
      criterion: {
        type: String,
        required: true
      },
      score: {
        type: Number,
        required: true,
        min: 0
      },
      maxScore: {
        type: Number,
        required: true,
        min: 0
      },
      feedback: String
    }],
    gradedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    gradedAt: Date
  },
  status: { 
    type: String, 
    enum: ['submitted', 'graded', 'returned', 'resubmitted'], 
    default: 'submitted' 
  },
  plagiarismCheck: {
    checked: { 
      type: Boolean, 
      default: false 
    },
    score: {
      type: Number,
      min: [0, 'Plagiarism score cannot be negative'],
      max: [100, 'Plagiarism score cannot exceed 100']
    },
    report: String
  }
}, { 
  timestamps: true 
});

// Indexes for efficient queries
submissionSchema.index({ student: 1, course: 1 });
submissionSchema.index({ 'assignment.assignmentId': 1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ submittedAt: -1 });

// Virtual to check if submission is graded
submissionSchema.virtual('isGraded').get(function() {
  return this.status === 'graded' && this.grade && this.grade.score !== undefined;
});

// Virtual to calculate grade percentage
submissionSchema.virtual('gradePercentage').get(function() {
  if (this.grade && this.grade.score !== undefined && this.grade.maxScore) {
    return Math.round((this.grade.score / this.grade.maxScore) * 100);
  }
  return null;
});

// Method to calculate total rubric score
submissionSchema.methods.calculateRubricScore = function() {
  if (!this.grade || !this.grade.rubricScores || !Array.isArray(this.grade.rubricScores) || this.grade.rubricScores.length === 0) {
    return null;
  }
  
  const totalScore = this.grade.rubricScores.reduce((sum, rubric) => sum + (rubric.score || 0), 0);
  const totalMaxScore = this.grade.rubricScores.reduce((sum, rubric) => sum + (rubric.maxScore || 0), 0);
  
  return {
    score: totalScore,
    maxScore: totalMaxScore,
    percentage: totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0
  };
};

// Method to update grade and status
submissionSchema.methods.gradeSubmission = function(gradeData, gradedBy) {
  this.grade = {
    ...this.grade,
    ...gradeData,
    gradedBy: gradedBy,
    gradedAt: new Date()
  };
  
  // Calculate percentage if not provided
  if (this.grade.score !== undefined && this.grade.maxScore && !this.grade.percentage) {
    this.grade.percentage = Math.round((this.grade.score / this.grade.maxScore) * 100);
  }
  
  // Determine letter grade if not provided
  if (this.grade.percentage !== undefined && !this.grade.letterGrade) {
    this.grade.letterGrade = this.calculateLetterGrade(this.grade.percentage);
  }
  
  this.status = 'graded';
  return this.save();
};

// Method to calculate letter grade from percentage
submissionSchema.methods.calculateLetterGrade = function(percentage) {
  if (percentage >= 97) return 'A+';
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 65) return 'D';
  return 'F';
};

// Static method to get submissions for an assignment
submissionSchema.statics.getAssignmentSubmissions = function(assignmentId) {
  return this.find({ 'assignment.assignmentId': assignmentId })
    .populate('student', 'firstName lastName email')
    .populate('course', 'title')
    .populate('grade.gradedBy', 'firstName lastName')
    .sort({ submittedAt: -1 });
};

// Static method to get student submissions for a course
submissionSchema.statics.getStudentCourseSubmissions = function(studentId, courseId) {
  return this.find({ student: studentId, course: courseId })
    .populate('course', 'title')
    .sort({ submittedAt: -1 });
};

// Static method to get grading statistics
submissionSchema.statics.getGradingStats = function(assignmentId) {
  return this.aggregate([
    { $match: { 'assignment.assignmentId': mongoose.Types.ObjectId(assignmentId) } },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        gradedSubmissions: {
          $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] }
        },
        averageScore: { $avg: '$grade.score' },
        averagePercentage: { $avg: '$grade.percentage' },
        highestScore: { $max: '$grade.score' },
        lowestScore: { $min: '$grade.score' }
      }
    }
  ]);
};

const Submission = mongoose.model('Submission', submissionSchema);

export default Submission;
