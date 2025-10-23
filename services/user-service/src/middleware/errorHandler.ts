import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { ApiError } from '../types';

interface ErrorWithCode extends Error {
  code?: string;
  details?: Array<{ message: string }>;
}

const errorHandler = (error: ErrorWithCode, req: Request, res: Response, next: NextFunction): void => {
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    method: req.method,
    url: req.url,
    body: req.body,
    ip: req.ip
  });

  // Validation errors
  if (error.name === 'ValidationError') {
    const apiError: ApiError = {
      error: 'Validation failed',
      details: error.details?.map(detail => detail.message) || [error.message]
    };
    res.status(400).json(apiError);
    return;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({ error: 'Token expired' });
    return;
  }

  // Prisma/Database errors
  if (error.code === 'P2002') {
    res.status(409).json({ error: 'Resource already exists' });
    return;
  }

  if (error.code === 'P2025') {
    res.status(404).json({ error: 'Resource not found' });
    return;
  }

  if (error.code === 'P2003') {
    res.status(400).json({ error: 'Referenced resource not found' });
    return;
  }

  // PostgreSQL direct errors (legacy support)
  if (error.code === '23505') {
    res.status(409).json({ error: 'Resource already exists' });
    return;
  }

  if (error.code === '23503') {
    res.status(400).json({ error: 'Referenced resource not found' });
    return;
  }

  // Default server error
  const apiError: ApiError = {
    error: error.message
  };
  
  res.status(500).json(apiError);
};

export default errorHandler;