const express = require('express');
const User = require('../models/User');
const { verifyToken, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Get user profile by ID
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return public profile info
    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        isOnline: user.is_online,
        lastSeen: user.last_seen
      }
    });
  } catch (error) {
    next(error);
  }
});

// Search users
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { q: query, limit = 10 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }
    
    const users = await User.searchUsers(query, parseInt(limit));
    
    res.json({
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        isOnline: user.is_online
      }))
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch('/me', verifyToken, async (req, res, next) => {
  try {
    const { displayName, avatarUrl } = req.body;
    const userId = req.user.id;
    
    // Basic validation
    if (displayName && (displayName.length < 1 || displayName.length > 100)) {
      return res.status(400).json({ error: 'Display name must be between 1 and 100 characters' });
    }
    
    const updates = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Update user
    const { pool } = require('../utils/database');
    const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 1}`).join(', ');
    const values = Object.values(updates);
    values.push(userId);
    
    await pool.query(
      `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = $${values.length}`,
      values
    );
    
    // Get updated user
    const updatedUser = await User.findById(userId);
    
    logger.info(`User profile updated: ${req.user.username}`);
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        displayName: updatedUser.display_name,
        avatarUrl: updatedUser.avatar_url
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;