import mongoose from "mongoose";

const discussionSchema = new mongoose.Schema({
  course: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course', 
    required: [true, 'Course is required'] 
  },
  title: { 
    type: String, 
    required: [true, 'Discussion title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  author: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Author is required'] 
  },
  category: {
    type: String,
    enum: ['general', 'assignment', 'lecture', 'project', 'announcement', 'qa'],
    default: 'general'
  },
  tags: [String],
  posts: [{
    author: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    content: { 
      type: String, 
      required: [true, 'Post content is required'],
      maxlength: [5000, 'Post content cannot exceed 5000 characters']
    },
    attachments: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      fileSize: Number
    }],
    likes: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      likedAt: { type: Date, default: Date.now }
    }],
    replies: [{
      author: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
      },
      content: { 
        type: String, 
        required: [true, 'Reply content is required'],
        maxlength: [2000, 'Reply cannot exceed 2000 characters']
      },
      attachments: [{
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number
      }],
      likes: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        likedAt: { type: Date, default: Date.now }
      }],
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    }],
    isPinned: { type: Boolean, default: false },
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],
  isLocked: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  viewCount: { type: Number, default: 0 },
  lastActivity: { type: Date, default: Date.now },
  moderators: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  settings: {
    allowAnonymous: { type: Boolean, default: false },
    requireApproval: { type: Boolean, default: false },
    allowAttachments: { type: Boolean, default: true }
  }
}, { 
  timestamps: true 
});

// Indexes for efficient queries
discussionSchema.index({ course: 1, category: 1 });
discussionSchema.index({ author: 1 });
discussionSchema.index({ lastActivity: -1 });
discussionSchema.index({ isPinned: -1, lastActivity: -1 });
discussionSchema.index({ 'posts.author': 1 });

// Virtual to get total posts count
discussionSchema.virtual('totalPosts').get(function() {
  return this.posts.length;
});

// Virtual to get total replies count
discussionSchema.virtual('totalReplies').get(function() {
  return this.posts.reduce((total, post) => total + post.replies.length, 0);
});

// Virtual to get latest post
discussionSchema.virtual('latestPost').get(function() {
  if (this.posts.length === 0) return null;
  return this.posts[this.posts.length - 1];
});

// Method to add a new post
discussionSchema.methods.addPost = function(postData) {
  this.posts.push(postData);
  this.lastActivity = new Date();
  return this.save();
};

// Method to add a reply to a post
discussionSchema.methods.addReply = function(postId, replyData) {
  const post = this.posts.id(postId);
  if (!post) {
    throw new Error('Post not found');
  }
  
  post.replies.push(replyData);
  this.lastActivity = new Date();
  return this.save();
};

// Method to like a post
discussionSchema.methods.likePost = function(postId, userId) {
  const post = this.posts.id(postId);
  if (!post) {
    throw new Error('Post not found');
  }
  
  const existingLike = post.likes.find(like => like.user.toString() === userId.toString());
  if (existingLike) {
    // Remove like (unlike)
    post.likes.pull(existingLike._id);
  } else {
    // Add like
    post.likes.push({ user: userId });
  }
  
  return this.save();
};

// Method to pin/unpin discussion
discussionSchema.methods.togglePin = function() {
  this.isPinned = !this.isPinned;
  return this.save();
};

// Static method to get course discussions
discussionSchema.statics.getCourseDiscussions = function(courseId, options = {}) {
  const {
    category,
    page = 1,
    limit = 20,
    sortBy = 'lastActivity',
    sortOrder = 'desc'
  } = options;
  
  const query = { course: courseId };
  if (category) {
    query.category = category;
  }
  
  const sort = {};
  sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  // Always prioritize pinned discussions
  const finalSort = { isPinned: -1, ...sort };
  
  return this.find(query)
    .populate('author', 'firstName lastName email profilePicture')
    .populate('posts.author', 'firstName lastName email profilePicture')
    .populate('posts.replies.author', 'firstName lastName email profilePicture')
    .sort(finalSort)
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to search discussions
discussionSchema.statics.searchDiscussions = function(courseId, searchTerm) {
  return this.find({
    course: courseId,
    $or: [
      { title: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { 'posts.content': { $regex: searchTerm, $options: 'i' } }
    ]
  })
  .populate('author', 'firstName lastName email profilePicture')
  .sort({ lastActivity: -1 });
};

const Discussion = mongoose.model('Discussion', discussionSchema);

export default Discussion;
