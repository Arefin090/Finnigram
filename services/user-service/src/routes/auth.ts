import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import UserService from '../services/UserService';
import { tokenBlacklistService } from '../services/TokenBlacklistService';
import { auditLogger } from '../services/AuditLogger';
import { generateTokens, verifyToken } from '../middleware/auth';
import { authRateLimiter, logoutRateLimiter } from '../middleware/rateLimiter';
import {
  validateRequest,
  registerSchema,
  loginSchema,
} from '../middleware/validation';
import logger from '../utils/logger';
import {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  LogoutResponse,
  GetUserResponse,
  AuthenticatedRequest,
  JWTPayload,
} from '../types';

const router = express.Router();

// Register new user
router.post(
  '/register',
  validateRequest(registerSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, username, password, displayName }: RegisterRequest =
        req.body;

      // Check if user already exists
      const existingUser =
        (await UserService.findByEmail(email)) ||
        (await UserService.findByUsername(username));
      if (existingUser) {
        res.status(409).json({ error: 'User already exists' });
        return;
      }

      // Create new user
      const user = await UserService.create({
        email,
        username,
        password,
        displayName,
      });

      // Generate tokens
      const tokens = await generateTokens(user.id);

      logger.info(`User registered successfully: ${username}`);

      const response: RegisterResponse = {
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
        },
        tokens,
      };

      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Login user
router.post(
  '/login',
  authRateLimiter.middleware(),
  validateRequest(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password }: LoginRequest = req.body;

      // Find user
      const user = await UserService.findByEmail(email);
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Validate password
      const isValidPassword = await UserService.validatePassword(
        user,
        password
      );
      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Update online status
      await UserService.updateOnlineStatus(user.id, true);

      // Generate tokens
      const tokens = await generateTokens(user.id);

      logger.info(`User logged in: ${user.username}`);

      const response: LoginResponse = {
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        tokens,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Refresh token
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken }: RefreshTokenRequest = req.body;

      if (!refreshToken) {
        res.status(401).json({ error: 'Refresh token required' });
        return;
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        res.status(500).json({ error: 'Server configuration error' });
        return;
      }
      const decoded = jwt.verify(refreshToken, jwtSecret) as JWTPayload;

      // Check if user still exists
      const user = await UserService.findById(decoded.userId);
      if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      // Generate new tokens
      const tokens = await generateTokens(user.id);

      const response: RefreshTokenResponse = {
        message: 'Token refreshed successfully',
        tokens,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// Logout
router.post(
  '/logout',
  logoutRateLimiter.middleware(),
  verifyToken,
  async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user || !req.token) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const startTime = Date.now();
      const correlationId = auditLogger.generateCorrelationId();

      // Blacklist the current token
      const blacklistSuccess = await tokenBlacklistService.blacklistToken(
        req.token,
        'logout'
      );

      // Update online status
      await UserService.updateOnlineStatus(req.user.id, false);

      const duration = Date.now() - startTime;

      // Comprehensive audit logging
      await auditLogger.logLogout(
        req.user.id,
        req.user.username,
        true,
        {
          tokenBlacklisted: blacklistSuccess,
          socketDisconnected: false, // Will be updated by socket service
          duration,
          reason: 'user_initiated',
        },
        {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          correlationId,
        }
      );

      const response: LogoutResponse = {
        message: 'Logout successful',
      };

      res.json(response);
    } catch (error) {
      // Log failed logout attempt
      if (req.user) {
        await auditLogger.logLogout(
          req.user.id,
          req.user.username,
          false,
          {
            reason: 'user_initiated',
          },
          {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
          }
        );
      }

      logger.error('Logout error:', {
        userId: req.user?.id,
        username: req.user?.username,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        action: 'logout',
        success: false,
      });
      next(error);
    }
  }
);

// Get current user
router.get(
  '/me',
  verifyToken,
  (req: AuthenticatedRequest, res: Response): void => {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const response: GetUserResponse = {
      user: {
        id: req.user.id,
        email: req.user.email,
        username: req.user.username,
        displayName: req.user.displayName,
        avatarUrl: req.user.avatarUrl,
        isOnline: req.user.isOnline,
        lastSeen: req.user.lastSeen,
      },
    };

    res.json(response);
  }
);

export default router;
