import bcrypt from 'bcryptjs';
import { prisma } from '../utils/database';
import logger from '../utils/logger';
import {
  User,
  UserSearchResult,
  CreateUserData,
  UpdateUserData,
  UserServiceInterface,
} from '../types';

class UserService implements UserServiceInterface {
  async create(data: CreateUserData): Promise<User> {
    try {
      const hashedPassword = await bcrypt.hash(data.password, 12);

      const user = await prisma.user.create({
        data: {
          email: data.email,
          username: data.username,
          passwordHash: hashedPassword,
          displayName: data.displayName || data.username,
        },
      });

      logger.info(`User created: ${data.username}`);
      return user;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new Error('Email or username already exists');
      }
      logger.error('User creation failed:', error);
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { email },
      });
      return user;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { username },
      });
      return user;
    } catch (error) {
      logger.error('Error finding user by username:', error);
      throw error;
    }
  }

  async findById(id: number): Promise<User | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
      });
      return user;
    } catch (error) {
      logger.error('Error finding user by id:', error);
      throw error;
    }
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.passwordHash);
  }

  async updateOnlineStatus(userId: number, isOnline: boolean): Promise<void> {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          isOnline,
          lastSeen: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error updating online status:', error);
      throw error;
    }
  }

  async searchUsers(
    query: string,
    limit: number = 10
  ): Promise<UserSearchResult[]> {
    try {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            {
              username: {
                contains: query,
                mode: 'insensitive',
              },
            },
            {
              displayName: {
                contains: query,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isOnline: true,
        },
        take: limit,
      });

      return users;
    } catch (error) {
      logger.error('Error searching users:', error);
      throw error;
    }
  }

  async updateProfile(userId: number, data: UpdateUserData): Promise<User> {
    try {
      const updateData: Partial<User> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (data.displayName !== undefined) {
        updateData.displayName = data.displayName;
      }
      if (data.avatarUrl !== undefined) {
        updateData.avatarUrl = data.avatarUrl;
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      return user;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }
}

export default new UserService();
