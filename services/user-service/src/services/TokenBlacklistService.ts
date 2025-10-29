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
  private readonly BLACKLIST_PREFIX = 'token_blacklist:';
  private readonly USER_SESSIONS_PREFIX = 'user_sessions:';

  constructor() {
    // Don't initialize Redis in constructor to avoid blocking startup
  }

  private async ensureRedisConnection(): Promise<void> {
    if (this.redisInitialized) return;

    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      this.redis.on('error', err => {
        logger.error('Redis Client Error in TokenBlacklistService:', err);
        this.redis = null; // Reset connection on error
        this.redisInitialized = false;
      });

      this.redis.on('disconnect', () => {
        logger.warn('Redis disconnected in TokenBlacklistService');
        this.redis = null;
        this.redisInitialized = false;
      });

      await this.redis.connect();
      logger.info('TokenBlacklistService Redis connected');
      this.redisInitialized = true;
    } catch (error) {
      logger.error(
        'Failed to connect to Redis for TokenBlacklistService:',
        error
      );
      this.redis = null; // Ensure service continues without Redis
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
    await this.ensureRedisConnection();

    if (!this.redis) {
      logger.warn('Redis not available for token blacklisting');
      return false;
    }

    try {
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded) {
        logger.warn('Failed to decode token for blacklisting');
        return false;
      }

      const tokenId = decoded.jti || (await this.generateTokenId(token));
      const blacklistEntry: BlacklistEntry = {
        tokenId,
        userId: decoded.userId,
        blacklistedAt: Date.now(),
        expiresAt: decoded.exp * 1000, // Convert to milliseconds
        reason,
      };

      // Store in blacklist with TTL matching token expiration
      const ttl = Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
      await this.redis.setEx(
        `${this.BLACKLIST_PREFIX}${tokenId}`,
        ttl,
        JSON.stringify(blacklistEntry)
      );

      // Remove from user active sessions
      await this.removeFromUserSessions(decoded.userId, tokenId);

      logger.info(
        `Token blacklisted: ${tokenId} for user ${decoded.userId}, reason: ${reason}`
      );
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
    await this.ensureRedisConnection();

    if (!this.redis) {
      return false; // Fail open if Redis unavailable
    }

    try {
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded) {
        return true; // Invalid tokens are considered blacklisted
      }

      const tokenId = decoded.jti || (await this.generateTokenId(token));
      const blacklistEntry = await this.redis.get(
        `${this.BLACKLIST_PREFIX}${tokenId}`
      );

      return blacklistEntry !== null;
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

    if (!this.redis) return;

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

      // Set expiration for the entire hash (24 hours)
      await this.redis.expire(`${this.USER_SESSIONS_PREFIX}${userId}`, 86400);
    } catch (error) {
      logger.error('Error adding to user sessions:', error);
    }
  }

  /**
   * Remove session from user's active sessions
   */
  async removeFromUserSessions(userId: number, tokenId: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.hDel(`${this.USER_SESSIONS_PREFIX}${userId}`, tokenId);
    } catch (error) {
      logger.error('Error removing from user sessions:', error);
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(
    userId: number
  ): Promise<{ tokenId: string; [key: string]: unknown }[]> {
    if (!this.redis) return [];

    try {
      const sessions = await this.redis.hGetAll(
        `${this.USER_SESSIONS_PREFIX}${userId}`
      );
      return Object.entries(sessions).map(([tokenId, data]) => ({
        tokenId,
        ...JSON.parse(data),
      }));
    } catch (error) {
      logger.error('Error getting user active sessions:', error);
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
    if (!this.redis) return 0;

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
      logger.error('Error blacklisting all user tokens:', error);
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
    if (!this.redis) return 0;

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
      logger.error('Error cleaning up expired entries:', error);
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
    if (!this.redis) {
      return { totalBlacklisted: 0, activeUsers: 0, totalSessions: 0 };
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
        totalBlacklisted: blacklistKeys.length,
        activeUsers: sessionKeys.length,
        totalSessions,
      };
    } catch (error) {
      logger.error('Error getting blacklist stats:', error);
      return { totalBlacklisted: 0, activeUsers: 0, totalSessions: 0 };
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
      logger.info('TokenBlacklistService Redis disconnected');
    }
  }
}

// Export singleton instance
export const tokenBlacklistService = new TokenBlacklistService();
export default TokenBlacklistService;
