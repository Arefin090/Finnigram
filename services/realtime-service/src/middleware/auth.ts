import axios from 'axios';
import { Socket } from 'socket.io';
import logger from '../utils/logger';
import { AuthenticatedSocket, UserServiceAuthResponse } from '../types';

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';

const socketAuth = async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
  try {
    const token = socket.handshake.auth.token as string;
    
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    
    // Verify token with user service
    const response = await axios.get<UserServiceAuthResponse>(`${USER_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    // Extend socket with user information
    const authenticatedSocket = socket as AuthenticatedSocket;
    authenticatedSocket.user = response.data.user;
    authenticatedSocket.userId = response.data.user.id;
    
    logger.info(`Socket authenticated for user: ${authenticatedSocket.user.username}`);
    next();
  } catch (error: any) {
    logger.error('Socket authentication failed:', error.message);
    next(new Error('Authentication failed'));
  }
};

export { socketAuth };