const express = require('express');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { verifyToken } = require('../middleware/auth');
const { invalidateConversationCache } = require('../utils/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Get messages for a conversation
router.get('/conversations/:conversationId', verifyToken, async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const userId = req.user.id;
    
    // Check if user is participant
    const isParticipant = await Conversation.isParticipant(conversationId, userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const messages = await Message.getConversationMessages(
      conversationId, 
      parseInt(limit), 
      parseInt(offset)
    );
    
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

// Send a new message
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const { conversationId, content, messageType = 'text', replyTo, attachments = [] } = req.body;
    const senderId = req.user.id;
    
    // Validation
    if (!conversationId || !content) {
      return res.status(400).json({ error: 'Conversation ID and content are required' });
    }
    
    if (content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }
    
    if (content.length > 4000) {
      return res.status(400).json({ error: 'Message content too long' });
    }
    
    // Check if user is participant
    const isParticipant = await Conversation.isParticipant(conversationId, senderId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validate reply message if specified
    if (replyTo) {
      const replyMessage = await Message.findById(replyTo);
      if (!replyMessage || replyMessage.conversation_id !== parseInt(conversationId)) {
        return res.status(400).json({ error: 'Invalid reply message' });
      }
    }
    
    const message = await Message.create({
      conversationId,
      senderId,
      content: content.trim(),
      messageType,
      replyTo,
      attachments
    });
    
    // Invalidate cache
    await invalidateConversationCache(conversationId);
    
    logger.info(`Message sent by user ${senderId} in conversation ${conversationId}`);
    
    // Get the complete message with attachments
    const completeMessage = await Message.findById(message.id);
    
    res.status(201).json({
      message: 'Message sent successfully',
      data: completeMessage
    });
  } catch (error) {
    next(error);
  }
});

// Edit a message
router.patch('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }
    
    if (content.length > 4000) {
      return res.status(400).json({ error: 'Message content too long' });
    }
    
    // Get original message
    const originalMessage = await Message.findById(id);
    if (!originalMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the sender
    if (originalMessage.sender_id !== userId) {
      return res.status(403).json({ error: 'Can only edit your own messages' });
    }
    
    // Check if message is not too old (e.g., 24 hours)
    const messageAge = Date.now() - new Date(originalMessage.created_at).getTime();
    const maxEditAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (messageAge > maxEditAge) {
      return res.status(400).json({ error: 'Message too old to edit' });
    }
    
    const updatedMessage = await Message.update(id, content.trim());
    
    // Invalidate cache
    await invalidateConversationCache(originalMessage.conversation_id);
    
    logger.info(`Message ${id} edited by user ${userId}`);
    
    res.json({
      message: 'Message updated successfully',
      data: updatedMessage
    });
  } catch (error) {
    next(error);
  }
});

// Delete a message
router.delete('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Get original message
    const originalMessage = await Message.findById(id);
    if (!originalMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Check if user is the sender
    if (originalMessage.sender_id !== userId) {
      return res.status(403).json({ error: 'Can only delete your own messages' });
    }
    
    await Message.delete(id);
    
    // Invalidate cache
    await invalidateConversationCache(originalMessage.conversation_id);
    
    logger.info(`Message ${id} deleted by user ${userId}`);
    
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Search messages
router.get('/search', verifyToken, async (req, res, next) => {
  try {
    const { q: query, limit = 20 } = req.query;
    const userId = req.user.id;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    const messages = await Message.searchMessages(userId, query.trim(), parseInt(limit));
    
    res.json({ messages });
  } catch (error) {
    next(error);
  }
});

module.exports = router;