import { Request, Response, NextFunction } from 'express';
import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (req: Request) => string;
  message?: string;
  headers?: boolean; // Include rate limit headers
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
  remaining: number;
}

class RateLimiter {
  private redis: RedisClientType | null = null;
  private options: Required<RateLimitOptions>;

  constructor(options: RateLimitOptions) {
    this.options = {
      keyGenerator: (req: Request) => req.ip || 'unknown',
      message: 'Too many requests, please try again later',
      headers: true,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...options,
    };

    this.initRedis();
  }

  private async initRedis(): Promise<void> {
    try {
      this.redis = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      });

      this.redis.on('error', err => {
        logger.error('Redis Client Error in RateLimiter:', err);
      });

      await this.redis.connect();
      logger.info('RateLimiter Redis connected');
    } catch (error) {
      logger.error('Failed to connect to Redis for RateLimiter:', error);
    }
  }

  public middleware() {
    return async (
      req: Request,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      if (!this.redis) {
        // If Redis is down, allow the request (fail open)
        next();
        return;
      }

      try {
        const key = `rate_limit:${this.options.keyGenerator(req)}`;
        const now = Date.now();
        const windowStart = now - this.options.windowMs;

        // Get current count and clean old entries
        const pipeline = this.redis.multi();

        // Remove old entries
        pipeline.zRemRangeByScore(key, '-inf', windowStart);

        // Count current entries
        pipeline.zCard(key);

        // Add current request
        pipeline.zAdd(key, { score: now, value: `${now}-${Math.random()}` });

        // Set expiration
        pipeline.expire(key, Math.ceil(this.options.windowMs / 1000));

        const results = await pipeline.exec();

        if (!results) {
          next();
          return;
        }

        const currentCount = (results[1] as number) || 0;
        const remaining = Math.max(
          0,
          this.options.maxRequests - currentCount - 1
        );
        const resetTime = now + this.options.windowMs;

        // Add rate limit headers
        if (this.options.headers) {
          res.set({
            'X-RateLimit-Limit': this.options.maxRequests.toString(),
            'X-RateLimit-Remaining': remaining.toString(),
            'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString(),
            'X-RateLimit-Window': Math.ceil(
              this.options.windowMs / 1000
            ).toString(),
          });
        }

        if (currentCount >= this.options.maxRequests) {
          logger.warn('Rate limit exceeded', {
            key: this.options.keyGenerator(req),
            currentCount,
            maxRequests: this.options.maxRequests,
            windowMs: this.options.windowMs,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
          });

          res.status(429).json({
            error: this.options.message,
            retryAfter: Math.ceil((resetTime - now) / 1000),
          });
          return;
        }

        next();
      } catch (error) {
        logger.error('Rate limiter error:', error);
        // Fail open - allow the request if there's an error
        next();
      }
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  async reset(key: string): Promise<boolean> {
    if (!this.redis) return false;

    try {
      const fullKey = `rate_limit:${key}`;
      await this.redis.del(fullKey);
      return true;
    } catch (error) {
      logger.error('Error resetting rate limit:', error);
      return false;
    }
  }

  /**
   * Get current rate limit info for a key
   */
  async getInfo(key: string): Promise<RateLimitInfo | null> {
    if (!this.redis) return null;

    try {
      const fullKey = `rate_limit:${key}`;
      const now = Date.now();
      const windowStart = now - this.options.windowMs;

      // Clean old entries and get count
      await this.redis.zRemRangeByScore(fullKey, '-inf', windowStart);
      const count = await this.redis.zCard(fullKey);

      return {
        count,
        resetTime: now + this.options.windowMs,
        remaining: Math.max(0, this.options.maxRequests - count),
      };
    } catch (error) {
      logger.error('Error getting rate limit info:', error);
      return null;
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
      logger.info('RateLimiter Redis disconnected');
    }
  }
}

// Pre-configured rate limiters for different endpoints
export const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 login attempts per 15 minutes
  keyGenerator: (req: Request) => `auth:${req.ip}`,
  message: 'Too many authentication attempts, please try again later',
});

export const logoutRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 logout attempts per minute (generous but prevents abuse)
  keyGenerator: (req: Request) => `logout:${req.ip}`,
  message: 'Too many logout attempts, please try again later',
});

export const generalRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 requests per 15 minutes
  keyGenerator: (req: Request) => `general:${req.ip}`,
  message: 'Too many requests, please try again later',
});

// User-specific rate limiter (requires authentication)
export const createUserRateLimiter = (
  options: Partial<RateLimitOptions> = {}
) => {
  return new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute per user
    keyGenerator: (req: Request & { user?: { id: number } }) =>
      `user:${req.user?.id || req.ip}`,
    message: 'Too many requests from this account, please try again later',
    ...options,
  });
};

export default RateLimiter;
