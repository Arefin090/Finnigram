const axios = require('axios');
const logger = require('../utils/logger');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

const socketAuth = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    
    // Verify token with user service
    const response = await axios.get(`${USER_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    socket.user = response.data.user;
    socket.userId = response.data.user.id;
    
    logger.info(`Socket authenticated for user: ${socket.user.username}`);
    next();
  } catch (error) {
    logger.error('Socket authentication failed:', error.message);
    next(new Error('Authentication failed'));
  }
};

module.exports = { socketAuth };