import mongoose from 'mongoose';

const quizResultSchema = new mongoose.Schema({
  // Student Information
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Course and Quiz Information
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  quizTitle: {
    type: String,
    required: true
  },
  
  // Module Information
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  
  // Quiz Results
  answers: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    selectedAnswer: {
      type: mongoose.Schema.Types.Mixed, // Can be number (index) or string
      required: true
    },
    isCorrect: {
      type: Boolean,
      required: true
    },
    points: {
      type: Number,
      default: 0
    }
  }],
  
  // Scoring
  totalQuestions: {
    type: Number,
    required: true
  },
  correctAnswers: {
    type: Number,
    required: true,
    default: 0
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  maxPoints: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  // Quiz Attempt Information
  attemptNumber: {
    type: Number,
    default: 1,
    min: 1
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  timeSpent: {
    type: Number, // in minutes
    required: true
  },
  
  // Pass/Fail Status
  passed: {
    type: Boolean,
    required: true
  },
  passingScore: {
    type: Number,
    required: true
  },
  
  // Metadata
  submittedAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
quizResultSchema.index({ student: 1, course: 1 });
quizResultSchema.index({ student: 1, quizId: 1 });
quizResultSchema.index({ course: 1, moduleId: 1 });
quizResultSchema.index({ submittedAt: -1 });

// Virtual for calculating grade letter
quizResultSchema.virtual('gradeLetter').get(function() {
  if (this.percentage >= 90) return 'A';
  if (this.percentage >= 80) return 'B';
  if (this.percentage >= 70) return 'C';
  if (this.percentage >= 60) return 'D';
  return 'F';
});

// Static method to get student's best attempt for a quiz
quizResultSchema.statics.getBestAttempt = function(studentId, quizId) {
  return this.findOne({ 
    student: studentId, 
    quizId: quizId 
  }).sort({ percentage: -1, submittedAt: -1 });
};

// Static method to get student's latest attempt for a quiz
quizResultSchema.statics.getLatestAttempt = function(studentId, quizId) {
  return this.findOne({ 
    student: studentId, 
    quizId: quizId 
  }).sort({ submittedAt: -1 });
};

// Static method to get course quiz statistics
quizResultSchema.statics.getCourseStats = function(courseId) {
  return this.aggregate([
    { $match: { course: new mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: '$quizId',
        quizTitle: { $first: '$quizTitle' },
        averageScore: { $avg: '$percentage' },
        totalAttempts: { $sum: 1 },
        passRate: { 
          $avg: { $cond: ['$passed', 1, 0] } 
        },
        highestScore: { $max: '$percentage' },
        lowestScore: { $min: '$percentage' }
      }
    }
  ]);
};

const QuizResult = mongoose.model('QuizResult', quizResultSchema);

export default QuizResult;
