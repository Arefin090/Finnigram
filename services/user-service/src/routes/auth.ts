import express, { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import UserService from '../services/UserService';
import { generateTokens, verifyToken } from '../middleware/auth';
import { validateRequest, registerSchema, loginSchema } from '../middleware/validation';
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
  JWTPayload
} from '../types';

const router = express.Router();

// Register new user
router.post('/register', validateRequest(registerSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, username, password, displayName }: RegisterRequest = req.body;
    
    // Check if user already exists
    const existingUser = await UserService.findByEmail(email) || await UserService.findByUsername(username);
    if (existingUser) {
      res.status(409).json({ error: 'User already exists' });
      return;
    }
    
    // Create new user
    const user = await UserService.create({ email, username, password, displayName });
    
    // Generate tokens
    const tokens = generateTokens(user.id);
    
    logger.info(`User registered successfully: ${username}`);
    
    const response: RegisterResponse = {
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName
      },
      tokens
    };
    
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// Login user
router.post('/login', validateRequest(loginSchema), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;
    
    // Find user
    const user = await UserService.findByEmail(email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    // Validate password
    const isValidPassword = await UserService.validatePassword(user, password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    
    // Update online status
    await UserService.updateOnlineStatus(user.id, true);
    
    // Generate tokens
    const tokens = generateTokens(user.id);
    
    logger.info(`User logged in: ${user.username}`);
    
    const response: LoginResponse = {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl
      },
      tokens
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { refreshToken }: RefreshTokenRequest = req.body;
    
    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token required' });
      return;
    }
    
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!) as JWTPayload;
    
    // Check if user still exists
    const user = await UserService.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    
    // Generate new tokens
    const tokens = generateTokens(user.id);
    
    const response: RefreshTokenResponse = {
      message: 'Token refreshed successfully',
      tokens
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Logout
router.post('/logout', verifyToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    // Update online status
    await UserService.updateOnlineStatus(req.user.id, false);
    
    logger.info(`User logged out: ${req.user.username}`);
    
    const response: LogoutResponse = {
      message: 'Logout successful'
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get('/me', verifyToken, (req: AuthenticatedRequest, res: Response): void => {
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
      lastSeen: req.user.lastSeen
    }
  };
  
  res.json(response);
});

export default router;