import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
  // Basic Course Information
  title: {
    type: String,
    required: [true, 'Course title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Course description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [500, 'Short description cannot exceed 500 characters']
  },
  
  // Course Details
  category: {
    type: String,
    required: [true, 'Course category is required'],
    enum: ['Programming', 'Design', 'Business', 'Marketing', 'Data Science', 'Photography', 'Music', 'Health', 'Language', 'Other']
  },
  level: {
    type: String,
    required: [true, 'Course level is required'],
    enum: ['beginner', 'intermediate', 'advanced']
  },
  language: {
    type: String,
    default: 'English'
  },
  duration: {
    hours: {
      type: Number,
      required: [true, 'Course duration in hours is required'],
      min: [1, 'Duration must be at least 1 hour']
    },
    weeks: {
      type: Number,
      default: 0
    }
  },
  
  // Instructor Information
  instructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Instructor is required']
  },
  instructorName: String, // Denormalized for quick access
  
  // Pricing
  pricing: {
    type: {
      type: String,
      enum: ['free', 'paid', 'subscription'],
      default: 'free'
    },
    amount: {
      type: Number,
      default: 0,
      min: [0, 'Price cannot be negative']
    },
    currency: {
      type: String,
      default: 'USD'
    },
    discount: {
      percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      validUntil: Date
    }
  },
  
  // Course Content Structure
  modules: [{
    title: {
      type: String,
      required: true
    },
    description: String,
    order: {
      type: Number,
      required: true
    },
    lessons: [{
      title: {
        type: String,
        required: true
      },
      description: String,
      order: {
        type: Number,
        required: true
      },
      contentType: {
        type: String,
        enum: ['video', 'document', 'quiz', 'assignment', 'text'],
        required: true
      },
      content: {
        videoUrl: String,
        documentUrl: String,
        textContent: String,
        duration: Number, // in minutes
        fileSize: Number // in bytes
      },
      isPreview: {
        type: Boolean,
        default: false
      },
      isCompleted: [{
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        completedAt: {
          type: Date,
          default: Date.now
        }
      }]
    }]
  }],
  
  // Assessments
  quizzes: [{
    title: String,
    description: String,
    moduleId: mongoose.Schema.Types.ObjectId,
    questions: [{
      question: String,
      type: {
        type: String,
        enum: ['multiple-choice', 'true-false', 'short-answer', 'essay']
      },
      options: [String], // For multiple choice
      correctAnswer: String,
      points: {
        type: Number,
        default: 1
      }
    }],
    timeLimit: Number, // in minutes
    passingScore: {
      type: Number,
      default: 70
    }
  }],
  
  assignments: [{
    title: String,
    description: String,
    moduleId: mongoose.Schema.Types.ObjectId,
    dueDate: Date,
    maxPoints: {
      type: Number,
      default: 100
    },
    submissionType: {
      type: String,
      enum: ['text', 'file', 'url', 'both']
    },
    instructions: String,
    attachments: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      fileSize: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  }],
  
  // Enrollment and Progress
  enrolledStudents: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date,
    certificateIssued: {
      type: Boolean,
      default: false
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Course Statistics
  stats: {
    totalEnrollments: {
      type: Number,
      default: 0
    },
    activeStudents: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    }
  },
  
  // Reviews and Ratings
  reviews: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      maxlength: [1000, 'Review comment cannot exceed 1000 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Course Media
  thumbnail: {
    type: String,
    default: ''
  },
  previewVideo: {
    type: String,
    default: ''
  },
  
  // Course Status and Visibility
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'suspended'],
    default: 'draft'
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  
  // SEO and Discovery
  tags: [String],
  keywords: [String],
  requirements: [String], // Prerequisites
  whatYouWillLearn: [String], // Learning outcomes
  
  // Dates
  publishedAt: Date,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total lessons count
courseSchema.virtual('totalLessons').get(function() {
  if (!this.modules || !Array.isArray(this.modules)) return 0;
  return this.modules.reduce((total, module) => {
    if (!module || !module.lessons || !Array.isArray(module.lessons)) return total;
    return total + module.lessons.length;
  }, 0);
});

// Virtual for course duration in total minutes
courseSchema.virtual('totalDurationMinutes').get(function() {
  if (!this.modules || !Array.isArray(this.modules)) return 0;
  return this.modules.reduce((total, module) => {
    if (!module || !module.lessons || !Array.isArray(module.lessons)) return total;
    return total + module.lessons.reduce((lessonTotal, lesson) => {
      if (!lesson || !lesson.content) return lessonTotal;
      return lessonTotal + (lesson.content.duration || 0);
    }, 0);
  }, 0);
});

// Index for better performance
courseSchema.index({ title: 'text', description: 'text', tags: 'text' });
courseSchema.index({ instructor: 1 });
courseSchema.index({ category: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ 'pricing.type': 1 });
courseSchema.index({ 'stats.averageRating': -1 });
courseSchema.index({ createdAt: -1 });

// Static methods
courseSchema.statics.findPublished = function() {
  return this.find({ status: 'published', isPublic: true });
};

courseSchema.statics.findByInstructor = function(instructorId) {
  return this.find({ instructor: instructorId });
};

courseSchema.statics.findByCategory = function(category) {
  return this.find({ category: category, status: 'published' });
};

export default mongoose.model('Course', courseSchema);