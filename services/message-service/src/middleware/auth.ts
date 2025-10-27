import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import logger from '../utils/logger';
import { AuthenticatedUser } from '../types';

const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || 'http://localhost:3001';

// Extend Express Request interface to include user
declare module 'express-serve-static-core' {
  interface Request {
    user: AuthenticatedUser;
  }
}

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Forward the token to user service for verification
    const response = await axios.get(`${USER_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: authHeader },
    });

    req.user = response.data.user as AuthenticatedUser;
    next();
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    logger.error('Token verification error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
};
