import express from 'express';
import {
  createDiscussion,
  getCourseDiscussions,
  getDiscussionById,
  addPost,
  addReply,
  likePost,
  togglePinDiscussion,
  toggleLockDiscussion,
  searchDiscussions,
  deleteDiscussion,
  uploadDiscussionFiles
} from '../controllers/discussionController.js';

const router = express.Router();

// Discussion routes
router.post('/', uploadDiscussionFiles.array('attachments'), createDiscussion);
router.get('/course/:courseId', getCourseDiscussions);
router.get('/course/:courseId/search', searchDiscussions);
router.get('/:discussionId', getDiscussionById);
router.delete('/:discussionId', deleteDiscussion);

// Post routes
router.post('/:discussionId/posts', uploadDiscussionFiles.array('attachments'), addPost);
router.post('/:discussionId/posts/:postId/replies', uploadDiscussionFiles.array('attachments'), addReply);
router.post('/:discussionId/posts/:postId/like', likePost);

// Moderation routes (instructor only)
router.patch('/:discussionId/pin', togglePinDiscussion);
router.patch('/:discussionId/lock', toggleLockDiscussion);

export default router;
