const axios = require('axios');
const logger = require('../utils/logger');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    // Forward the token to user service for verification
    const response = await axios.get(`${USER_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: authHeader }
    });
    
    req.user = response.data.user;
    next();
  } catch (error) {
    if (error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    logger.error('Token verification error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = { verifyToken };