import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ValidationError, DatabaseError } from '../types';

const errorHandler = (error: Error & DatabaseError & ValidationError, req: Request, res: Response, next: NextFunction): Response => {
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

  return res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
  });
};

export default errorHandler;