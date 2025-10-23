import express, { Request, Response, NextFunction } from 'express';
import UserService from '../services/UserService';
import { verifyToken, optionalAuth } from '../middleware/auth';
import logger from '../utils/logger';
import { 
  GetUserResponse, 
  SearchUsersResponse, 
  UpdateProfileRequest,
  UpdateProfileResponse,
  AuthenticatedRequest 
} from '../types';

const router = express.Router();

// Get user profile by ID
router.get('/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    
    if (isNaN(userId)) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }
    
    const user = await UserService.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    
    // Return public profile info
    const response: GetUserResponse = {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Search users
router.get('/', verifyToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const { q: query, limit = '10' } = req.query;
    
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Search query required' });
      return;
    }
    
    const limitNumber = parseInt(limit as string, 10);
    if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 100) {
      res.status(400).json({ error: 'Limit must be between 1 and 100' });
      return;
    }
    
    const users = await UserService.searchUsers(query, limitNumber);
    
    const response: SearchUsersResponse = {
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isOnline: user.isOnline
      }))
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch('/me', verifyToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }
    
    const { displayName, avatarUrl }: UpdateProfileRequest = req.body;
    const userId = req.user.id;
    
    // Basic validation
    if (displayName !== undefined && (displayName.length < 1 || displayName.length > 100)) {
      res.status(400).json({ error: 'Display name must be between 1 and 100 characters' });
      return;
    }
    
    const updateData: UpdateProfileRequest = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }
    
    // Update user
    const updatedUser = await UserService.updateProfile(userId, updateData);
    
    logger.info(`User profile updated: ${req.user.username}`);
    
    const response: UpdateProfileResponse = {
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        avatarUrl: updatedUser.avatarUrl
      }
    };
    
    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;