import { Message, Conversation } from '../models/message.js';
import User from '../models/user.js';
import Course from '../models/course.js';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

// Configure multer for message attachments
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = 'uploads/messages';
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `message-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|mp3|ppt|pptx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type for messages'));
  }
};

export const uploadMessageFiles = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: fileFilter
});

// Helper function to get user from token or fallback
const getUserFromRequest = async (req) => {
  let user = null;

  // Try JWT first
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = await User.findById(decoded.userId);
    } catch (error) {
      console.log('JWT verification failed:', error.message);
    }
  }

  // Fallback to query/body
  if (!user) {
    const userId = req.query.userId || req.body.userId || req.query.studentId || req.body.studentId || req.query.instructorId || req.body.instructorId;
    if (userId) {
      user = await User.findById(userId);
    }
  }

  return user;
};

// Send a message
export const sendMessage = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { recipientId, courseId, content, conversationId } = req.body;

    // Validate recipient
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    // If courseId provided, verify both users have access to the course
    if (courseId) {
      const course = await Course.findById(courseId).populate('enrolledStudents.student');
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      const senderInCourse = course.instructor.toString() === user._id.toString() || 
        course.enrolledStudents?.some(enrollment => enrollment.student._id.toString() === user._id.toString());
      
      const recipientInCourse = course.instructor.toString() === recipient._id.toString() || 
        course.enrolledStudents?.some(enrollment => enrollment.student._id.toString() === recipient._id.toString());

      if (!senderInCourse || !recipientInCourse) {
        return res.status(403).json({ message: 'Both users must be enrolled in the course' });
      }
    }

    // Process uploaded files
    const attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        attachments.push({
          fileName: file.originalname,
          fileUrl: file.path,
          fileType: file.mimetype,
          fileSize: file.size
        });
      }
    }

    let conversation;

    if (conversationId) {
      // Use existing conversation
      conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }

      // Verify user is participant
      const isParticipant = conversation.participants.some(p => p.user.toString() === user._id.toString());
      if (!isParticipant) {
        return res.status(403).json({ message: 'Not authorized to send messages in this conversation' });
      }
    } else {
      // Find or create conversation
      conversation = await Conversation.findOne({
        participants: {
          $all: [
            { $elemMatch: { user: user._id } },
            { $elemMatch: { user: recipientId } }
          ]
        },
        ...(courseId && { course: courseId })
      });

      if (!conversation) {
        // Create new conversation
        conversation = new Conversation({
          participants: [
            { user: user._id, joinedAt: new Date() },
            { user: recipientId, joinedAt: new Date() }
          ],
          ...(courseId && { course: courseId })
        });
        await conversation.save();
      }
    }

    // Create message
    const message = new Message({
      conversation: conversation._id,
      sender: user._id,
      content,
      attachments,
      readBy: [{ user: user._id, readAt: new Date() }] // Mark as read by sender
    });

    await message.save();

    // Update conversation
    conversation.lastMessage = message._id;
    conversation.lastActivity = new Date();
    await conversation.save();

    // Populate message for response
    await message.populate('sender', 'firstName lastName email');

    res.status(201).json({
      message: 'Message sent successfully',
      messageData: message,
      conversationId: conversation._id
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      message: 'Error sending message', 
      error: error.message 
    });
  }
};

// Get user conversations
export const getConversations = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { page = 1, limit = 20, courseId } = req.query;

    const filter = {
      'participants.user': user._id,
      ...(courseId && { course: courseId })
    };

    const conversations = await Conversation.find(filter)
      .populate('participants.user', 'firstName lastName email')
      .populate('course', 'title')
      .populate('lastMessage')
      .sort({ lastActivity: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Add unread count for each conversation
    for (const conversation of conversations) {
      const unreadCount = await Message.countDocuments({
        conversation: conversation._id,
        sender: { $ne: user._id },
        'readBy.user': { $ne: user._id }
      });
      conversation.unreadCount = unreadCount;
    }

    const total = await Conversation.countDocuments(filter);

    res.json({
      conversations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalConversations: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ 
      message: 'Error fetching conversations', 
      error: error.message 
    });
  }
};

// Get conversation messages
export const getConversationMessages = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(p => p.user.toString() === user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to view this conversation' });
    }

    const messages = await Message.find({ conversation: conversationId })
      .populate('sender', 'firstName lastName email')
      .sort({ sentAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Message.countDocuments({ conversation: conversationId });

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      conversation,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalMessages: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ 
      message: 'Error fetching messages', 
      error: error.message 
    });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { conversationId } = req.params;

    // Verify user is participant
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some(p => p.user.toString() === user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to mark messages in this conversation' });
    }

    // Mark all unread messages as read
    await Message.updateMany(
      {
        conversation: conversationId,
        sender: { $ne: user._id },
        'readBy.user': { $ne: user._id }
      },
      {
        $push: {
          readBy: {
            user: user._id,
            readAt: new Date()
          }
        }
      }
    );

    res.json({ message: 'Messages marked as read' });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ 
      message: 'Error marking messages as read', 
      error: error.message 
    });
  }
};

// Add reaction to message
export const addReaction = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify user is in the conversation
    const conversation = await Conversation.findById(message.conversation);
    const isParticipant = conversation.participants.some(p => p.user.toString() === user._id.toString());
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to react to this message' });
    }

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(r => 
      r.user.toString() === user._id.toString() && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction
      message.reactions = message.reactions.filter(r => 
        !(r.user.toString() === user._id.toString() && r.emoji === emoji)
      );
    } else {
      // Add reaction
      message.reactions.push({
        user: user._id,
        emoji,
        reactedAt: new Date()
      });
    }

    await message.save();

    res.json({
      message: 'Reaction updated successfully',
      reactions: message.reactions
    });

  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ 
      message: 'Error adding reaction', 
      error: error.message 
    });
  }
};

// Delete message
export const deleteMessage = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only sender can delete their message
    if (message.sender.toString() !== user._id.toString()) {
      return res.status(403).json({ message: 'Can only delete your own messages' });
    }

    // Delete associated files
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        try {
          await fs.unlink(attachment.fileUrl);
        } catch (error) {
          console.error('Error deleting attachment:', error);
        }
      }
    }

    await Message.findByIdAndDelete(messageId);

    // Update conversation last message if this was the last message
    const conversation = await Conversation.findById(message.conversation);
    if (conversation.lastMessage && conversation.lastMessage.toString() === messageId) {
      const lastMessage = await Message.findOne({ conversation: conversation._id })
        .sort({ sentAt: -1 });
      
      conversation.lastMessage = lastMessage ? lastMessage._id : null;
      conversation.lastActivity = lastMessage ? lastMessage.sentAt : conversation.createdAt;
      await conversation.save();
    }

    res.json({ message: 'Message deleted successfully' });

  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ 
      message: 'Error deleting message', 
      error: error.message 
    });
  }
};

// Get unread message count
export const getUnreadCount = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId } = req.query;

    // Get user's conversations
    const conversationFilter = {
      'participants.user': user._id,
      ...(courseId && { course: courseId })
    };

    const conversations = await Conversation.find(conversationFilter).select('_id');
    const conversationIds = conversations.map(c => c._id);

    // Count unread messages
    const unreadCount = await Message.countDocuments({
      conversation: { $in: conversationIds },
      sender: { $ne: user._id },
      'readBy.user': { $ne: user._id }
    });

    res.json({ unreadCount });

  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ 
      message: 'Error getting unread count', 
      error: error.message 
    });
  }
};

// Search messages
export const searchMessages = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { q: searchTerm, conversationId, courseId } = req.query;

    if (!searchTerm) {
      return res.status(400).json({ message: 'Search term is required' });
    }

    // Get user's conversations
    let conversationFilter = { 'participants.user': user._id };
    if (courseId) {
      conversationFilter.course = courseId;
    }

    const conversations = await Conversation.find(conversationFilter).select('_id');
    let conversationIds = conversations.map(c => c._id);

    // If specific conversation provided, filter to that
    if (conversationId) {
      conversationIds = conversationIds.filter(id => id.toString() === conversationId);
    }

    // Search messages
    const messages = await Message.find({
      conversation: { $in: conversationIds },
      content: { $regex: searchTerm, $options: 'i' }
    })
    .populate('sender', 'firstName lastName email')
    .populate('conversation', 'participants course')
    .sort({ sentAt: -1 })
    .limit(50)
    .lean();

    res.json({
      messages,
      searchTerm,
      resultCount: messages.length
    });

  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({ 
      message: 'Error searching messages', 
      error: error.message 
    });
  }
};

// Archive/unarchive conversation
export const toggleArchiveConversation = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Find user's participant record
    const participantIndex = conversation.participants.findIndex(p => 
      p.user.toString() === user._id.toString()
    );

    if (participantIndex === -1) {
      return res.status(403).json({ message: 'Not authorized to archive this conversation' });
    }

    // Toggle archived status for this user
    const isCurrentlyArchived = conversation.participants[participantIndex].isArchived || false;
    conversation.participants[participantIndex].isArchived = !isCurrentlyArchived;

    await conversation.save();

    res.json({
      message: `Conversation ${!isCurrentlyArchived ? 'archived' : 'unarchived'} successfully`,
      isArchived: !isCurrentlyArchived
    });

  } catch (error) {
    console.error('Error toggling archive status:', error);
    res.status(500).json({ 
      message: 'Error toggling archive status', 
      error: error.message 
    });
  }
};
