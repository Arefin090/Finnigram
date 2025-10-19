const express = require('express');
const User = require('../models/User');
const { generateTokens, verifyToken } = require('../middleware/auth');
const { validateRequest, registerSchema, loginSchema } = require('../middleware/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Register new user
router.post('/register', validateRequest(registerSchema), async (req, res, next) => {
  try {
    const { email, username, password, displayName } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findByEmail(email) || await User.findByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    
    // Create new user
    const user = await User.create({ email, username, password, displayName });
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    logger.info(`User registered successfully: ${username}`);
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
});

// Login user
router.post('/login', validateRequest(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Validate password
    const isValidPassword = await User.validatePassword(user, password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update online status
    await User.updateOnlineStatus(user.id, true);
    
    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    logger.info(`User logged in: ${user.username}`);
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url
      },
      tokens: {
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }
    
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    // Check if user still exists
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Generate new tokens
    const tokens = generateTokens(user.id);
    
    res.json({
      message: 'Token refreshed successfully',
      tokens
    });
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', verifyToken, async (req, res, next) => {
  try {
    // Update online status
    await User.updateOnlineStatus(req.user.id, false);
    
    logger.info(`User logged out: ${req.user.username}`);
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', verifyToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      displayName: req.user.display_name,
      avatarUrl: req.user.avatar_url,
      isOnline: req.user.is_online,
      lastSeen: req.user.last_seen
    }
  });
});

module.exports = router;