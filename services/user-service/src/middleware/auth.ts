import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';
import UserService from '../services/UserService';
import { tokenBlacklistService } from '../services/TokenBlacklistService';
import logger from '../utils/logger';
import { JWTPayload, TokenPair, AuthenticatedRequest } from '../types';

export const generateTokens = async (userId: number): Promise<TokenPair> => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  // Generate unique JTI (JWT ID) for tracking
  const crypto = await import('crypto');
  const jti = crypto.randomBytes(16).toString('hex');

  const accessToken = jwt.sign({ userId, jti }, jwtSecret, {
    expiresIn: '15m',
  });

  const refreshToken = jwt.sign({ userId, jti: jti + '_refresh' }, jwtSecret, {
    expiresIn: '7d',
  });

  // Track this session
  tokenBlacklistService.addToUserSessions(userId, jti);

  return { accessToken, refreshToken };
};

export const verifyToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    const token = authHeader.substring(7);

    // Check if token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      logger.warn('Attempted use of blacklisted token');
      res.status(401).json({ error: 'Token has been revoked' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    const user = await UserService.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Store token in request for potential blacklisting
    req.token = token;
    req.user = user;
    next();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (error instanceof Error && error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    logger.error('Token verification error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        next();
        return;
      }
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
      const user = await UserService.findById(decoded.userId);
      if (user) {
        req.user = user;
      }
    }

    next();
  } catch {
    // Continue without authentication for optional auth
    next();
  }
};
