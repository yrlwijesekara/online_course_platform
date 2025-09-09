import Discussion from '../models/discussion.js';
import User from '../models/user.js';
import Course from '../models/course.js';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

// Configure multer for discussion attachments
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = 'uploads/discussions';
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `discussion-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|mp3|ppt|pptx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type for discussions'));
  }
};

export const uploadDiscussionFiles = multer({
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

// Create a new discussion
export const createDiscussion = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId, title, description, category, tags } = req.body;

    // Verify course access
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    // Check if user is enrolled or is instructor
    const isInstructor = course.instructor.toString() === user._id.toString();
    const isEnrolled = course.enrolledStudents?.some(enrollment => 
      enrollment.student.toString() === user._id.toString()
    );

    if (!isInstructor && !isEnrolled) {
      return res.status(403).json({ message: 'Not authorized to create discussions in this course' });
    }

    const discussion = new Discussion({
      course: courseId,
      title,
      description,
      author: user._id,
      category: category || 'general',
      tags: tags || []
    });

    await discussion.save();

    // Populate for response
    await discussion.populate('author', 'firstName lastName email');
    await discussion.populate('course', 'title');

    res.status(201).json({
      message: 'Discussion created successfully',
      discussion
    });

  } catch (error) {
    console.error('Error creating discussion:', error);
    res.status(500).json({ 
      message: 'Error creating discussion', 
      error: error.message 
    });
  }
};

// Get course discussions
export const getCourseDiscussions = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId } = req.params;
    const { category, page = 1, limit = 20, sortBy = 'lastActivity', sortOrder = 'desc' } = req.query;

    // Verify course access
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const discussions = await Discussion.getCourseDiscussions(courseId, {
      category,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder
    });

    const total = await Discussion.countDocuments({ 
      course: courseId,
      ...(category && { category })
    });

    res.json({
      discussions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalDiscussions: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching discussions:', error);
    res.status(500).json({ 
      message: 'Error fetching discussions', 
      error: error.message 
    });
  }
};

// Get discussion by ID
export const getDiscussionById = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { discussionId } = req.params;

    const discussion = await Discussion.findById(discussionId)
      .populate('author', 'firstName lastName email')
      .populate('course', 'title instructor')
      .populate('posts.author', 'firstName lastName email')
      .populate('posts.replies.author', 'firstName lastName email')
      .lean();

    if (!discussion) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    // Increment view count
    await Discussion.findByIdAndUpdate(discussionId, { $inc: { viewCount: 1 } });

    res.json({ discussion });

  } catch (error) {
    console.error('Error fetching discussion:', error);
    res.status(500).json({ 
      message: 'Error fetching discussion', 
      error: error.message 
    });
  }
};

// Add post to discussion
export const addPost = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { discussionId } = req.params;
    const { content } = req.body;

    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    // Check if discussion is locked
    if (discussion.isLocked) {
      return res.status(403).json({ message: 'Discussion is locked' });
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

    const postData = {
      author: user._id,
      content,
      attachments
    };

    await discussion.addPost(postData);

    // Get updated discussion
    const updatedDiscussion = await Discussion.findById(discussionId)
      .populate('posts.author', 'firstName lastName email')
      .lean();

    res.json({
      message: 'Post added successfully',
      post: updatedDiscussion.posts[updatedDiscussion.posts.length - 1]
    });

  } catch (error) {
    console.error('Error adding post:', error);
    res.status(500).json({ 
      message: 'Error adding post', 
      error: error.message 
    });
  }
};

// Add reply to post
export const addReply = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { discussionId, postId } = req.params;
    const { content } = req.body;

    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    if (discussion.isLocked) {
      return res.status(403).json({ message: 'Discussion is locked' });
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

    const replyData = {
      author: user._id,
      content,
      attachments
    };

    await discussion.addReply(postId, replyData);

    res.json({
      message: 'Reply added successfully'
    });

  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ 
      message: 'Error adding reply', 
      error: error.message 
    });
  }
};

// Like/unlike post
export const likePost = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { discussionId, postId } = req.params;

    const discussion = await Discussion.findById(discussionId);
    if (!discussion) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    await discussion.likePost(postId, user._id);

    res.json({
      message: 'Post like toggled successfully'
    });

  } catch (error) {
    console.error('Error toggling post like:', error);
    res.status(500).json({ 
      message: 'Error toggling post like', 
      error: error.message 
    });
  }
};

// Pin/unpin discussion (instructor only)
export const togglePinDiscussion = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { discussionId } = req.params;

    const discussion = await Discussion.findById(discussionId).populate('course', 'instructor');
    if (!discussion) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    // Check if user is instructor
    if (discussion.course.instructor.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only instructors can pin discussions' });
    }

    await discussion.togglePin();

    res.json({
      message: `Discussion ${discussion.isPinned ? 'pinned' : 'unpinned'} successfully`,
      isPinned: discussion.isPinned
    });

  } catch (error) {
    console.error('Error toggling discussion pin:', error);
    res.status(500).json({ 
      message: 'Error toggling discussion pin', 
      error: error.message 
    });
  }
};

// Lock/unlock discussion (instructor only)
export const toggleLockDiscussion = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { discussionId } = req.params;

    const discussion = await Discussion.findById(discussionId).populate('course', 'instructor');
    if (!discussion) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    // Check if user is instructor
    if (discussion.course.instructor.toString() !== user._id.toString() && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only instructors can lock discussions' });
    }

    discussion.isLocked = !discussion.isLocked;
    await discussion.save();

    res.json({
      message: `Discussion ${discussion.isLocked ? 'locked' : 'unlocked'} successfully`,
      isLocked: discussion.isLocked
    });

  } catch (error) {
    console.error('Error toggling discussion lock:', error);
    res.status(500).json({ 
      message: 'Error toggling discussion lock', 
      error: error.message 
    });
  }
};

// Search discussions
export const searchDiscussions = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { courseId } = req.params;
    const { q: searchTerm } = req.query;

    if (!searchTerm) {
      return res.status(400).json({ message: 'Search term is required' });
    }

    const discussions = await Discussion.searchDiscussions(courseId, searchTerm);

    res.json({
      discussions,
      searchTerm,
      resultCount: discussions.length
    });

  } catch (error) {
    console.error('Error searching discussions:', error);
    res.status(500).json({ 
      message: 'Error searching discussions', 
      error: error.message 
    });
  }
};

// Delete discussion (author or instructor only)
export const deleteDiscussion = async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { discussionId } = req.params;

    const discussion = await Discussion.findById(discussionId).populate('course', 'instructor');
    if (!discussion) {
      return res.status(404).json({ message: 'Discussion not found' });
    }

    // Check permissions
    const isAuthor = discussion.author.toString() === user._id.toString();
    const isInstructor = discussion.course.instructor.toString() === user._id.toString();
    
    if (!isAuthor && !isInstructor && user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this discussion' });
    }

    // Delete associated files
    for (const post of discussion.posts) {
      if (post.attachments && post.attachments.length > 0) {
        for (const attachment of post.attachments) {
          try {
            await fs.unlink(attachment.fileUrl);
          } catch (error) {
            console.error('Error deleting attachment:', error);
          }
        }
      }
    }

    await Discussion.findByIdAndDelete(discussionId);

    res.json({ message: 'Discussion deleted successfully' });

  } catch (error) {
    console.error('Error deleting discussion:', error);
    res.status(500).json({ 
      message: 'Error deleting discussion', 
      error: error.message 
    });
  }
};
