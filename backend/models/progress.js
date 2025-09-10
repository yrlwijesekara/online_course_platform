import mongoose from "mongoose";

const progressSchema = new mongoose.Schema({
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
  overallProgress: { 
    type: Number, 
    default: 0, 
    min: [0, 'Progress cannot be less than 0'], 
    max: [100, 'Progress cannot be more than 100'] 
  },
  completionPercentage: {
    type: Number,
    default: 0,
    min: [0, 'Completion percentage cannot be less than 0'],
    max: [100, 'Completion percentage cannot be more than 100']
  },
  moduleProgress: [{
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedLessons: [{
      type: mongoose.Schema.Types.ObjectId
    }],
    timeSpent: {
      type: Number,
      default: 0,
      min: [0, 'Time spent cannot be negative']
    },
    lastAccessed: {
      type: Date,
      default: Date.now
    }
  }],
  quizResults: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'QuizResult' 
  }],
  submissions: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Submission' 
  }],
  
  // Performance tracking for certificate generation
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
    default: 0,
    min: 0,
    max: 100
  },
  avgAssignmentScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  finalScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Enrollment and completion tracking
  enrolledAt: {
    type: Date,
    default: Date.now
  },
  totalTimeSpent: { 
    type: Number, 
    default: 0,
    min: [0, 'Total time spent cannot be negative']
  },
  lastActivity: { 
    type: Date, 
    default: Date.now 
  },
  completionDate: Date,
  completedAt: Date,
  certificateEarned: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Certificate' 
  },
  certificateGenerated: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true 
});

progressSchema.index({ student: 1, course: 1 }, { unique: true });
progressSchema.index({ lastActivity: -1 });
progressSchema.index({ overallProgress: 1 });

progressSchema.virtual('isCompleted').get(function() {
  return this.overallProgress >= 100;
});

progressSchema.virtual('completionStatus').get(function() {
  if (this.overallProgress >= 100) return 'completed';
  if (this.overallProgress >= 50) return 'in-progress';
  if (this.overallProgress > 0) return 'started';
  return 'not-started';
});

progressSchema.methods.calculateOverallProgress = function() {
  if (!this.moduleProgress || this.moduleProgress.length === 0) {
    return 0;
  }
  
  const completedModules = this.moduleProgress.filter(module => module.completed).length;
  const totalModules = this.moduleProgress.length;
  
  return Math.round((completedModules / totalModules) * 100);
};

progressSchema.methods.calculateCompletionPercentage = function() {
  // More comprehensive calculation including assignments and quizzes
  let totalItems = this.moduleProgress.length;
  let completedItems = this.moduleProgress.filter(m => m.completed).length;
  
  // Add assignments and quizzes to the calculation
  if (this.totalAssignments > 0) {
    totalItems += this.totalAssignments;
    completedItems += this.completedAssignments;
  }
  
  if (this.totalQuizzes > 0) {
    totalItems += this.totalQuizzes;
    completedItems += this.completedQuizzes;
  }
  
  return totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
};

progressSchema.methods.calculateFinalScore = function() {
  if (this.avgQuizScore === 0 && this.avgAssignmentScore === 0) {
    return 85; // Default passing score
  }
  
  const quizWeight = 0.4;
  const assignmentWeight = 0.6;
  
  return Math.round(
    (this.avgQuizScore * quizWeight) + 
    (this.avgAssignmentScore * assignmentWeight)
  );
};

progressSchema.methods.updateProgress = async function() {
  const wasCompleted = this.overallProgress >= 100;
  
  this.overallProgress = this.calculateOverallProgress();
  this.completionPercentage = this.calculateCompletionPercentage();
  this.finalScore = this.calculateFinalScore();
  this.lastActivity = new Date();
  
  // Check if course is now completed
  if (this.completionPercentage >= 100 && !this.completionDate) {
    this.completionDate = new Date();
    this.completedAt = new Date();
    
    // Auto-generate certificate if not already generated
    if (!this.certificateGenerated) {
      try {
        const { autoGenerateCertificate } = await import('../controllers/certificateController.js');
        const certificate = await autoGenerateCertificate(this.student, this.course, this);
        
        if (certificate) {
          this.certificateEarned = certificate._id;
          this.certificateGenerated = true;
        }
      } catch (error) {
        console.error('Error auto-generating certificate:', error);
        // Continue without failing the progress update
      }
    }
  }
  
  return this.save();
};

progressSchema.statics.getStudentProgress = function(studentId, courseId) {
  return this.findOne({ student: studentId, course: courseId })
    .populate('student', 'firstName lastName email')
    .populate('course', 'title description')
    .populate('quizResults')
    .populate('submissions')
    .populate('certificateEarned');
};

progressSchema.statics.getStudentAllProgress = function(studentId) {
  return this.find({ student: studentId })
    .populate('course', 'title description instructor')
    .sort({ lastActivity: -1 });
};

progressSchema.statics.getCourseStats = function(courseId) {
  return this.aggregate([
    { $match: { course: mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: null,
        totalStudents: { $sum: 1 },
        completedStudents: {
          $sum: {
            $cond: [{ $gte: ["$overallProgress", 100] }, 1, 0]
          }
        },
        averageProgress: { $avg: "$overallProgress" },
        totalTimeSpent: { $sum: "$totalTimeSpent" }
      }
    }
  ]);
};

const Progress = mongoose.model('Progress', progressSchema);

export default Progress;
