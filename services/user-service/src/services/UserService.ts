import bcrypt from 'bcryptjs';
import { prisma } from '../utils/database';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  User,
  UserSearchResult,
  CreateUserData,
  UpdateUserData,
  UserServiceInterface,
  UserCreatedEvent,
  UserUpdatedEvent,
} from '../types';

class UserService implements UserServiceInterface {
  async create(data: CreateUserData): Promise<User> {
    try {
      const hashedPassword = await bcrypt.hash(data.password, 12);

      // Use transaction to ensure atomicity between user creation and event publishing
      const result = await prisma.$transaction(async tx => {
        // Create the user
        const user = await tx.user.create({
          data: {
            email: data.email,
            username: data.username,
            passwordHash: hashedPassword,
            displayName: data.displayName || data.username,
          },
        });

        // Create the event for the outbox
        const userCreatedEvent: UserCreatedEvent = {
          eventId: uuidv4(),
          eventType: 'USER_CREATED',
          userId: user.id,
          timestamp: new Date().toISOString(),
          version: 1,
          data: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt.toISOString(),
          },
        };

        // Write event to outbox table in the same transaction
        await tx.userEventOutbox.create({
          data: {
            userId: user.id,
            eventType: userCreatedEvent.eventType,
            eventData: userCreatedEvent as object,
            processed: false,
          },
        });

        return user;
      });

      logger.info(`User created with event outbox entry: ${data.username}`);
      return result;
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
      // Use transaction to ensure atomicity between user update and event publishing
      await prisma.$transaction(async tx => {
        // Update the user's online status
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            isOnline,
            lastSeen: new Date(),
          },
        });

        // Create the event for the outbox
        const userUpdatedEvent: UserUpdatedEvent = {
          eventId: uuidv4(),
          eventType: 'USER_UPDATED',
          userId: user.id,
          timestamp: new Date().toISOString(),
          version: 1,
          data: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            isOnline: user.isOnline,
            lastSeen: user.lastSeen?.toISOString() || null,
            updatedAt: user.updatedAt.toISOString(),
          },
          changes: ['isOnline', 'lastSeen'],
        };

        // Write event to outbox table in the same transaction
        await tx.userEventOutbox.create({
          data: {
            userId: user.id,
            eventType: userUpdatedEvent.eventType,
            eventData: userUpdatedEvent as object,
            processed: false,
          },
        });
      });

      logger.info(
        `User online status updated with event outbox entry: ${userId}, isOnline: ${isOnline}`
      );
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
      // Track which fields are changing for the event
      const changedFields: string[] = [];

      const updateData: Partial<User> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (data.displayName !== undefined) {
        updateData.displayName = data.displayName;
        changedFields.push('displayName');
      }
      if (data.avatarUrl !== undefined) {
        updateData.avatarUrl = data.avatarUrl;
        changedFields.push('avatarUrl');
      }

      // Use transaction to ensure atomicity between user update and event publishing
      const result = await prisma.$transaction(async tx => {
        // Update the user
        const user = await tx.user.update({
          where: { id: userId },
          data: updateData,
        });

        // Only create event if there were actual changes
        if (changedFields.length > 0) {
          // Create the event for the outbox
          const userUpdatedEvent: UserUpdatedEvent = {
            eventId: uuidv4(),
            eventType: 'USER_UPDATED',
            userId: user.id,
            timestamp: new Date().toISOString(),
            version: 1,
            data: {
              id: user.id,
              username: user.username,
              email: user.email,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              isOnline: user.isOnline,
              lastSeen: user.lastSeen?.toISOString() || null,
              updatedAt: user.updatedAt.toISOString(),
            },
            changes: changedFields,
          };

          // Write event to outbox table in the same transaction
          await tx.userEventOutbox.create({
            data: {
              userId: user.id,
              eventType: userUpdatedEvent.eventType,
              eventData: userUpdatedEvent as object,
              processed: false,
            },
          });
        }

        return user;
      });

      logger.info(
        `User profile updated with event outbox entry: ${userId}, changes: ${changedFields.join(', ')}`
      );
      return result;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  async findUsersByIds(userIds: number[]): Promise<User[]> {
    try {
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: userIds,
          },
        },
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          isOnline: true,
          lastSeen: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return users as User[];
    } catch (error) {
      logger.error('Error finding users by IDs:', error);
      throw error;
    }
  }
}

export default new UserService();
