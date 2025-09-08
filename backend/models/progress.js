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
  certificateEarned: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Certificate' 
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

progressSchema.methods.calculateOverallProgress = function() {
  if (!this.moduleProgress || this.moduleProgress.length === 0) {
    return 0;
  }
  
  const completedModules = this.moduleProgress.filter(module => module.completed).length;
  const totalModules = this.moduleProgress.length;
  
  return Math.round((completedModules / totalModules) * 100);
};

progressSchema.methods.updateProgress = function() {
  this.overallProgress = this.calculateOverallProgress();
  this.lastActivity = new Date();
  
  if (this.overallProgress >= 100 && !this.completionDate) {
    this.completionDate = new Date();
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
