import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  conversation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: [true, 'Conversation is required'] 
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: [true, 'Sender is required'] 
  },
  recipients: [{
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    readAt: Date,
    deliveredAt: { type: Date, default: Date.now }
  }],
  messageType: {
    type: String,
    enum: ['text', 'file', 'image', 'video', 'audio', 'link'],
    default: 'text'
  },
  content: {
    text: {
      type: String,
      maxlength: [2000, 'Message cannot exceed 2000 characters']
    },
    attachments: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      fileSize: Number,
      thumbnailUrl: String // For images/videos
    }],
    links: [{
      url: String,
      title: String,
      description: String,
      image: String
    }]
  },
  replyTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String, required: true },
    reactedAt: { type: Date, default: Date.now }
  }],
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedFor: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }], // For "delete for me" functionality
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  course: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course' 
  }, // Optional: if message is course-related
  assignment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Assignment' 
  } // Optional: if message is assignment-related
}, { 
  timestamps: true 
});

// Conversation Schema (for grouping messages)
const conversationSchema = new mongoose.Schema({
  participants: [{
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    role: {
      type: String,
      enum: ['student', 'instructor', 'admin'],
      required: true
    },
    joinedAt: { type: Date, default: Date.now },
    leftAt: Date,
    isActive: { type: Boolean, default: true }
  }],
  conversationType: {
    type: String,
    enum: ['private', 'group', 'course_support', 'assignment_help'],
    default: 'private'
  },
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Conversation title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  course: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Course' 
  },
  lastMessage: {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    content: String,
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: Date
  },
  isArchived: { type: Boolean, default: false },
  archivedBy: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  settings: {
    allowFileSharing: { type: Boolean, default: true },
    muteNotifications: { type: Boolean, default: false },
    autoDeleteAfter: Number // Days
  }
}, { 
  timestamps: true 
});

// Indexes for efficient queries
messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ 'recipients.user': 1, 'recipients.readAt': 1 });
messageSchema.index({ course: 1 });

conversationSchema.index({ 'participants.user': 1 });
conversationSchema.index({ course: 1 });
conversationSchema.index({ 'lastMessage.sentAt': -1 });

// Virtual to check if message is read by all recipients
messageSchema.virtual('isReadByAll').get(function() {
  return this.recipients.every(recipient => recipient.readAt);
});

// Virtual to get unread recipients
messageSchema.virtual('unreadRecipients').get(function() {
  return this.recipients.filter(recipient => !recipient.readAt);
});

// Method to mark message as read by user
messageSchema.methods.markAsRead = function(userId) {
  const recipient = this.recipients.find(r => r.user.toString() === userId.toString());
  if (recipient && !recipient.readAt) {
    recipient.readAt = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  const existingReaction = this.reactions.find(r => 
    r.user.toString() === userId.toString() && r.emoji === emoji
  );
  
  if (existingReaction) {
    // Remove reaction if already exists
    this.reactions.pull(existingReaction._id);
  } else {
    // Remove any other reaction from this user first
    this.reactions = this.reactions.filter(r => r.user.toString() !== userId.toString());
    // Add new reaction
    this.reactions.push({ user: userId, emoji });
  }
  
  return this.save();
};

// Method to soft delete message
messageSchema.methods.softDelete = function(userId, deleteForAll = false) {
  if (deleteForAll) {
    this.isDeleted = true;
    this.deletedAt = new Date();
  } else {
    if (!this.deletedFor.includes(userId)) {
      this.deletedFor.push(userId);
    }
  }
  return this.save();
};

// Virtual to get active participants
conversationSchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => p.isActive && !p.leftAt);
});

// Method to add participant to conversation
conversationSchema.methods.addParticipant = function(userId, userRole) {
  const existingParticipant = this.participants.find(p => 
    p.user.toString() === userId.toString()
  );
  
  if (existingParticipant) {
    if (!existingParticipant.isActive) {
      existingParticipant.isActive = true;
      existingParticipant.leftAt = undefined;
      existingParticipant.joinedAt = new Date();
    }
  } else {
    this.participants.push({
      user: userId,
      role: userRole
    });
  }
  
  return this.save();
};

// Method to remove participant from conversation
conversationSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString()
  );
  
  if (participant) {
    participant.isActive = false;
    participant.leftAt = new Date();
  }
  
  return this.save();
};

// Method to update last message
conversationSchema.methods.updateLastMessage = function(message) {
  this.lastMessage = {
    messageId: message._id,
    content: message.content.text || 'File attachment',
    sender: message.sender,
    sentAt: message.createdAt
  };
  return this.save();
};

// Static method to get user conversations
conversationSchema.statics.getUserConversations = function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    includeArchived = false
  } = options;
  
  const query = {
    'participants.user': userId,
    'participants.isActive': true
  };
  
  if (!includeArchived) {
    query.isArchived = { $ne: true };
  }
  
  return this.find(query)
    .populate('participants.user', 'firstName lastName email profilePicture')
    .populate('lastMessage.sender', 'firstName lastName')
    .populate('course', 'title')
    .sort({ 'lastMessage.sentAt': -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

// Static method to create or get private conversation
conversationSchema.statics.createOrGetPrivateConversation = async function(user1Id, user2Id, courseId = null) {
  // Check if conversation already exists
  let conversation = await this.findOne({
    conversationType: 'private',
    'participants.user': { $all: [user1Id, user2Id] },
    course: courseId
  });
  
  if (!conversation) {
    // Create new conversation
    const user1 = await mongoose.model('User').findById(user1Id);
    const user2 = await mongoose.model('User').findById(user2Id);
    
    conversation = new this({
      participants: [
        { user: user1Id, role: user1.role },
        { user: user2Id, role: user2.role }
      ],
      conversationType: 'private',
      course: courseId
    });
    
    await conversation.save();
  }
  
  return conversation;
};

const Message = mongoose.model('Message', messageSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);

export { Message, Conversation };
export default { Message, Conversation };
