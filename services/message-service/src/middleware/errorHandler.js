const logger = require('../utils/logger');

const errorHandler = (error, req, res, next) => {
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    body: req.body,
    ip: req.ip
  });

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.details?.map(detail => detail.message) || [error.message]
    });
  }

  if (error.code === '23505') {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  if (error.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource not found' });
  }

  if (error.code === '23514') {
    return res.status(400).json({ error: 'Constraint violation' });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
};

module.exports = errorHandler;