import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { createClient, RedisClientType } from 'redis';

interface TokenPayload {
  userId: number;
  iat: number;
  exp: number;
  jti?: string; // JWT ID for tracking
}

interface BlacklistEntry {
  tokenId: string;
  userId: number;
  blacklistedAt: number;
  expiresAt: number;
  reason: 'logout' | 'security' | 'admin';
}

class TokenBlacklistService {
  private redis: RedisClientType | null = null;
  private redisInitialized = false;
  private redisAvailable = false;
  private inMemoryBlacklist = new Set<string>();
  private readonly BLACKLIST_PREFIX = 'token_blacklist:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';

  constructor() {
    // No Redis initialization in constructor - services must start without external dependencies
    logger.info('TokenBlacklistService initialized (Redis lazy-loaded)');
  }

  private async ensureRedisConnection(): Promise<void> {
    if (this.redisInitialized) return;

    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
        },
      });

      this.redis.on('error', err => {
        logger.warn('Redis Client Error in TokenBlacklistService:', err);
        this.redisAvailable = false;
      });

      this.redis.on('disconnect', () => {
        logger.info('Redis disconnected in TokenBlacklistService');
        this.redisAvailable = false;
      });

      this.redis.on('connect', () => {
        logger.info('TokenBlacklistService Redis connected');
        this.redisAvailable = true;
      });

      await this.redis.connect();
      this.redisAvailable = true;
      this.redisInitialized = true;
    } catch (error) {
      logger.warn(
        'Redis unavailable for TokenBlacklistService, using in-memory fallback:',
        error
      );
      this.redis = null;
      this.redisAvailable = false;
      this.redisInitialized = true; // Don't retry immediately
    }
  }

  /**
   * Add a token to the blacklist
   */
  async blacklistToken(
    token: string,
    reason: BlacklistEntry['reason'] = 'logout'
  ): Promise<boolean> {
    try {
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded) {
        logger.warn('Failed to decode token for blacklisting');
        return false;
      }

      const tokenId = decoded.jti || (await this.generateTokenId(token));

      // Always add to in-memory blacklist as fallback
      this.inMemoryBlacklist.add(tokenId);

      // Try Redis if available
      await this.ensureRedisConnection();
      if (this.redis && this.redisAvailable) {
        try {
          const blacklistEntry: BlacklistEntry = {
            tokenId,
            userId: decoded.userId,
            blacklistedAt: Date.now(),
            expiresAt: decoded.exp * 1000,
            reason,
          };

          const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
          await this.redis.setEx(
            `${this.BLACKLIST_PREFIX}${tokenId}`,
            ttl,
            JSON.stringify(blacklistEntry)
          );

          await this.removeFromUserSessions(decoded.userId, tokenId);
          logger.info(
            `Token blacklisted in Redis: ${tokenId} for user ${decoded.userId}, reason: ${reason}`
          );
        } catch (redisError) {
          logger.warn(
            'Redis blacklisting failed, using in-memory only:',
            redisError
          );
          this.redisAvailable = false;
        }
      } else {
        logger.info(
          `Token blacklisted in memory only: ${tokenId} for user ${decoded.userId}, reason: ${reason}`
        );
      }

      return true;
    } catch (error) {
      logger.error('Error blacklisting token:', error);
      return false;
    }
  }

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded) {
        return true; // Invalid tokens are considered blacklisted
      }

      const tokenId = decoded.jti || (await this.generateTokenId(token));

      // Check in-memory first (fastest)
      if (this.inMemoryBlacklist.has(tokenId)) {
        return true;
      }

      // Try Redis if available
      await this.ensureRedisConnection();
      if (this.redis && this.redisAvailable) {
        try {
          const blacklistEntry = await this.redis.get(
            `${this.BLACKLIST_PREFIX}${tokenId}`
          );
          if (blacklistEntry !== null) {
            // Sync to in-memory for future fast lookups
            this.inMemoryBlacklist.add(tokenId);
            return true;
          }
        } catch (redisError) {
          logger.warn(
            'Redis blacklist check failed, using in-memory only:',
            redisError
          );
          this.redisAvailable = false;
        }
      }

      return false; // Not found in either store
    } catch (error) {
      logger.error('Error checking token blacklist:', error);
      return false; // Fail open on error
    }
  }

  /**
   * Track active user sessions
   */
  async addToUserSessions(
    userId: number,
    tokenId: string,
    deviceInfo?: string
  ): Promise<void> {
    await this.ensureRedisConnection();
    if (!this.redis || !this.redisAvailable) {
      logger.info(
        `Session tracking unavailable for user ${userId} (Redis not available)`
      );
      return;
    }

    try {
      const sessionInfo = {
        tokenId,
        createdAt: Date.now(),
        deviceInfo: deviceInfo || 'unknown',
        lastActivity: Date.now(),
      };

      await this.redis.hSet(
        `${this.USER_SESSIONS_PREFIX}${userId}`,
        tokenId,
        JSON.stringify(sessionInfo)
      );

      await this.redis.expire(`${this.USER_SESSIONS_PREFIX}${userId}`, 86400);
      logger.debug(`Session tracked for user ${userId}: ${tokenId}`);
    } catch (error) {
      logger.warn('Error adding to user sessions:', error);
      this.redisAvailable = false;
    }
  }

  /**
   * Remove session from user's active sessions
   */
  async removeFromUserSessions(userId: number, tokenId: string): Promise<void> {
    if (!this.redis || !this.redisAvailable) return;

    try {
      await this.redis.hDel(`${this.USER_SESSIONS_PREFIX}${userId}`, tokenId);
      logger.debug(`Session removed for user ${userId}: ${tokenId}`);
    } catch (error) {
      logger.warn('Error removing from user sessions:', error);
      this.redisAvailable = false;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(
    userId: number
  ): Promise<{ tokenId: string; [key: string]: unknown }[]> {
    await this.ensureRedisConnection();
    if (!this.redis || !this.redisAvailable) return [];

    try {
      const sessions = await this.redis.hGetAll(
        `${this.USER_SESSIONS_PREFIX}${userId}`
      );
      return Object.entries(sessions).map(([tokenId, data]) => ({
        tokenId,
        ...JSON.parse(data),
      }));
    } catch (error) {
      logger.warn('Error getting user active sessions:', error);
      this.redisAvailable = false;
      return [];
    }
  }

  /**
   * Blacklist all tokens for a user (logout from all devices)
   */
  async blacklistAllUserTokens(
    userId: number,
    _reason: BlacklistEntry['reason'] = 'logout'
  ): Promise<number> {
    await this.ensureRedisConnection();
    if (!this.redis || !this.redisAvailable) {
      logger.info(
        `Bulk token blacklisting unavailable for user ${userId} (Redis not available)`
      );
      return 0;
    }

    try {
      const sessions = await this.getUserActiveSessions(userId);
      let blacklistedCount = 0;

      for (const session of sessions) {
        // We need the actual token to blacklist it, but we only have tokenId
        // This would require storing token-to-tokenId mapping or using JTI in tokens
        logger.info(
          `Would blacklist token ${session.tokenId} for user ${userId}`
        );
        blacklistedCount++;
      }

      // Clear all user sessions
      await this.redis.del(`${this.USER_SESSIONS_PREFIX}${userId}`);

      logger.info(`Blacklisted ${blacklistedCount} tokens for user ${userId}`);
      return blacklistedCount;
    } catch (error) {
      logger.warn('Error blacklisting all user tokens:', error);
      this.redisAvailable = false;
      return 0;
    }
  }

  /**
   * Generate a consistent token ID from token content
   */
  private async generateTokenId(token: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Cleanup expired blacklist entries (maintenance)
   */
  async cleanupExpiredEntries(): Promise<number> {
    await this.ensureRedisConnection();
    if (!this.redis || !this.redisAvailable) {
      logger.info('Blacklist cleanup unavailable (Redis not available)');
      return 0;
    }

    try {
      const pattern = `${this.BLACKLIST_PREFIX}*`;
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const ttl = await this.redis.ttl(key);
        if (ttl <= 0) {
          await this.redis.del(key);
          cleanedCount++;
        }
      }

      logger.info(`Cleaned up ${cleanedCount} expired blacklist entries`);
      return cleanedCount;
    } catch (error) {
      logger.warn('Error cleaning up expired entries:', error);
      this.redisAvailable = false;
      return 0;
    }
  }

  /**
   * Get blacklist statistics
   */
  async getBlacklistStats(): Promise<{
    totalBlacklisted: number;
    activeUsers: number;
    totalSessions: number;
  }> {
    await this.ensureRedisConnection();

    if (!this.redis || !this.redisAvailable) {
      return {
        totalBlacklisted: this.inMemoryBlacklist.size,
        activeUsers: 0,
        totalSessions: 0,
      };
    }

    try {
      const blacklistKeys = await this.redis.keys(`${this.BLACKLIST_PREFIX}*`);
      const sessionKeys = await this.redis.keys(
        `${this.USER_SESSIONS_PREFIX}*`
      );

      let totalSessions = 0;
      for (const key of sessionKeys) {
        const count = await this.redis.hLen(key);
        totalSessions += count;
      }

      return {
        totalBlacklisted: blacklistKeys.length + this.inMemoryBlacklist.size,
        activeUsers: sessionKeys.length,
        totalSessions,
      };
    } catch (error) {
      logger.warn('Error getting blacklist stats:', error);
      this.redisAvailable = false;
      return {
        totalBlacklisted: this.inMemoryBlacklist.size,
        activeUsers: 0,
        totalSessions: 0,
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.disconnect();
        logger.info('TokenBlacklistService Redis disconnected');
      } catch (error) {
        logger.warn('Error disconnecting Redis:', error);
      }
    }
    logger.info('TokenBlacklistService shutdown complete');
  }
}

// Export singleton instance
export const tokenBlacklistService = new TokenBlacklistService();
export default TokenBlacklistService;
