import express from 'express';
import {
  sendMessage,
  getConversations,
  getConversationMessages,
  markMessagesAsRead,
  addReaction,
  deleteMessage,
  getUnreadCount,
  searchMessages,
  toggleArchiveConversation,
  uploadMessageFiles
} from '../controllers/messageController.js';

const router = express.Router();

// Message routes
router.post('/send', uploadMessageFiles.array('attachments'), sendMessage);
router.get('/conversations', getConversations);
router.get('/conversations/:conversationId/messages', getConversationMessages);
router.patch('/conversations/:conversationId/read', markMessagesAsRead);
router.patch('/conversations/:conversationId/archive', toggleArchiveConversation);

// Message actions
router.post('/messages/:messageId/reaction', addReaction);
router.delete('/messages/:messageId', deleteMessage);

// Utility routes
router.get('/unread-count', getUnreadCount);
router.get('/search', searchMessages);

export default router;
