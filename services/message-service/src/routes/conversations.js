const express = require('express');
const Conversation = require('../models/Conversation');
const { verifyToken } = require('../middleware/auth');
const { getCachedUserConversations, cacheUserConversations } = require('../utils/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Get user's conversations
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Skip cache for debugging
    const conversations = await Conversation.getUserConversations(userId);
    
    res.json({ conversations });
  } catch (error) {
    logger.error('Error in GET /conversations:', error);
    next(error);
  }
});

// Create new conversation
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const { type, name, description, participants = [] } = req.body;
    const createdBy = req.user.id;
    
    // Validation
    if (type === 'group' && !name) {
      return res.status(400).json({ error: 'Group conversations require a name' });
    }
    
    if (type === 'direct' && participants.length !== 1) {
      return res.status(400).json({ error: 'Direct conversations require exactly one other participant' });
    }
    
    // Check if direct conversation already exists
    if (type === 'direct') {
      const existingConversation = await checkExistingDirectConversation(createdBy, participants[0]);
      if (existingConversation) {
        return res.json({ conversation: existingConversation });
      }
    }
    
    const conversation = await Conversation.create({
      type,
      name,
      description,
      createdBy,
      participants: [...participants, createdBy]
    });
    
    logger.info(`Conversation created by user ${createdBy}: ${conversation.id}`);
    
    res.status(201).json({
      message: 'Conversation created successfully',
      conversation
    });
  } catch (error) {
    next(error);
  }
});

// Get conversation details
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if user is participant
    const isParticipant = await Conversation.isParticipant(id, userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const participants = await Conversation.getParticipants(id);
    
    res.json({
      conversation: {
        ...conversation,
        participants
      }
    });
  } catch (error) {
    next(error);
  }
});

// Add participant to conversation
router.post('/:id/participants', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId: newUserId } = req.body;
    const currentUserId = req.user.id;
    
    // Check if current user is participant and has permission
    const isParticipant = await Conversation.isParticipant(id, currentUserId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Check if conversation exists and is a group
    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    if (conversation.type === 'direct') {
      return res.status(400).json({ error: 'Cannot add participants to direct conversations' });
    }
    
    await Conversation.addParticipant(id, newUserId);
    
    logger.info(`User ${newUserId} added to conversation ${id} by ${currentUserId}`);
    
    res.json({ message: 'Participant added successfully' });
  } catch (error) {
    next(error);
  }
});

// Remove participant from conversation
router.delete('/:id/participants/:userId', verifyToken, async (req, res, next) => {
  try {
    const { id, userId: targetUserId } = req.params;
    const currentUserId = req.user.id;
    
    // Check if current user is participant
    const isParticipant = await Conversation.isParticipant(id, currentUserId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Users can remove themselves, or admins can remove others
    if (currentUserId !== parseInt(targetUserId)) {
      // Check if current user is admin (simplified - in real app, check role)
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    await Conversation.removeParticipant(id, targetUserId);
    
    logger.info(`User ${targetUserId} removed from conversation ${id}`);
    
    res.json({ message: 'Participant removed successfully' });
  } catch (error) {
    next(error);
  }
});

// Mark conversation as read
router.patch('/:id/read', verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    // Check if user is participant
    const isParticipant = await Conversation.isParticipant(id, userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await Conversation.updateLastRead(id, userId);
    
    res.json({ message: 'Conversation marked as read' });
  } catch (error) {
    next(error);
  }
});

// Helper function to check existing direct conversation
async function checkExistingDirectConversation(user1Id, user2Id) {
  try {
    const { pool } = require('../utils/database');
    const result = await pool.query(`
      SELECT c.* FROM conversations c
      WHERE c.type = 'direct'
        AND EXISTS (SELECT 1 FROM conversation_participants cp1 WHERE cp1.conversation_id = c.id AND cp1.user_id = $1)
        AND EXISTS (SELECT 1 FROM conversation_participants cp2 WHERE cp2.conversation_id = c.id AND cp2.user_id = $2)
      LIMIT 1
    `, [user1Id, user2Id]);
    
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error checking existing direct conversation:', error);
    return null;
  }
}

module.exports = router;