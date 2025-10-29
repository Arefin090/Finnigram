import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

interface AuditEvent {
  id: string;
  timestamp: string;
  userId?: number;
  username?: string;
  action: string;
  resource: string;
  details: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  success: boolean;
  duration?: number;
  correlationId?: string;
  sessionId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface SecurityEvent extends AuditEvent {
  threatLevel: 'info' | 'warning' | 'alert' | 'critical';
  riskScore: number;
  geolocation?: {
    country?: string;
    city?: string;
    coordinates?: [number, number];
  };
}

class AuditLogger {
  private redis: RedisClientType | null = null;
  private redisInitialized = false;
  private readonly AUDIT_LOG_KEY = 'audit_logs';
  private readonly SECURITY_LOG_KEY = 'security_logs';
  private readonly USER_ACTIVITY_KEY = 'user_activity';
  private readonly MAX_LOG_ENTRIES = 10000; // Keep last 10k entries

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
        logger.error('Redis Client Error in AuditLogger:', err);
        this.redis = null;
        this.redisInitialized = false;
      });

      this.redis.on('disconnect', () => {
        logger.warn('Redis disconnected in AuditLogger');
        this.redis = null;
        this.redisInitialized = false;
      });

      await this.redis.connect();
      logger.info('AuditLogger Redis connected');
      this.redisInitialized = true;
    } catch (error) {
      logger.error('Failed to connect to Redis for AuditLogger:', error);
      this.redis = null;
      this.redisInitialized = true; // Don't retry immediately
    }
  }

  /**
   * Generate unique correlation ID for request tracking
   */
  generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Log general audit event
   */
  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: this.generateCorrelationId(),
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId || this.generateCorrelationId(),
      ...event,
    };

    // Log to Winston (for files/console)
    logger.info('Audit Event', auditEvent);

    // Store in Redis for real-time querying
    await this.ensureRedisConnection();
    if (this.redis) {
      try {
        const pipeline = this.redis.multi();

        // Add to main audit log
        pipeline.lPush(this.AUDIT_LOG_KEY, JSON.stringify(auditEvent));
        pipeline.lTrim(this.AUDIT_LOG_KEY, 0, this.MAX_LOG_ENTRIES - 1);

        // Add to user-specific activity log if user is identified
        if (event.userId) {
          const userKey = `${this.USER_ACTIVITY_KEY}:${event.userId}`;
          pipeline.lPush(userKey, JSON.stringify(auditEvent));
          pipeline.lTrim(userKey, 0, 100); // Keep last 100 per user
          pipeline.expire(userKey, 30 * 24 * 60 * 60); // 30 days
        }

        await pipeline.exec();
      } catch (error) {
        logger.error('Failed to store audit event in Redis:', error);
      }
    }
  }

  /**
   * Log security-specific event
   */
  async logSecurityEvent(
    event: Omit<SecurityEvent, 'id' | 'timestamp'>
  ): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: this.generateCorrelationId(),
      timestamp: new Date().toISOString(),
      correlationId: event.correlationId || this.generateCorrelationId(),
      ...event,
    };

    // Log to Winston with higher severity
    const logLevel =
      event.threatLevel === 'critical'
        ? 'error'
        : event.threatLevel === 'alert'
          ? 'warn'
          : 'info';

    logger[logLevel]('Security Event', securityEvent);

    // Store in Redis
    await this.ensureRedisConnection();
    if (this.redis) {
      try {
        const pipeline = this.redis.multi();

        // Add to security log
        pipeline.lPush(this.SECURITY_LOG_KEY, JSON.stringify(securityEvent));
        pipeline.lTrim(this.SECURITY_LOG_KEY, 0, this.MAX_LOG_ENTRIES - 1);

        // Also add to general audit log
        pipeline.lPush(this.AUDIT_LOG_KEY, JSON.stringify(securityEvent));
        pipeline.lTrim(this.AUDIT_LOG_KEY, 0, this.MAX_LOG_ENTRIES - 1);

        // Set up alerts for high-risk events
        if (event.riskScore >= 7 || event.threatLevel === 'critical') {
          pipeline.publish('security_alerts', JSON.stringify(securityEvent));
        }

        await pipeline.exec();
      } catch (error) {
        logger.error('Failed to store security event in Redis:', error);
      }
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    action: 'login' | 'logout' | 'token_refresh' | 'password_change',
    userId: number,
    username: string,
    success: boolean,
    details: Record<string, unknown> = {},
    request?: { ip?: string; userAgent?: string }
  ): Promise<void> {
    const event: Omit<AuditEvent, 'id' | 'timestamp'> = {
      userId,
      username,
      action,
      resource: 'authentication',
      details: {
        ...details,
        authMethod: 'jwt',
      },
      ip: request?.ip,
      userAgent: request?.userAgent,
      success,
      severity: success ? 'low' : 'medium',
    };

    await this.logEvent(event);

    // Log as security event if failed
    if (!success) {
      await this.logSecurityEvent({
        ...event,
        threatLevel: 'warning',
        riskScore: action === 'login' ? 5 : 3,
      });
    }
  }

  /**
   * Log logout specifically with enhanced details
   */
  async logLogout(
    userId: number,
    username: string,
    success: boolean,
    details: {
      tokenBlacklisted?: boolean;
      socketDisconnected?: boolean;
      duration?: number;
      reason?: 'user_initiated' | 'token_expired' | 'security' | 'admin';
    } = {},
    request?: { ip?: string; userAgent?: string; correlationId?: string }
  ): Promise<void> {
    const event: Omit<AuditEvent, 'id' | 'timestamp'> = {
      userId,
      username,
      action: 'logout',
      resource: 'authentication',
      details: {
        ...details,
        logoutReason: details.reason || 'user_initiated',
        securityMeasures: {
          tokenBlacklisted: details.tokenBlacklisted || false,
          socketDisconnected: details.socketDisconnected || false,
        },
      },
      ip: request?.ip,
      userAgent: request?.userAgent,
      success,
      duration: details.duration,
      correlationId: request?.correlationId,
      severity: success ? 'low' : 'high',
    };

    await this.logEvent(event);
  }

  /**
   * Get recent audit events
   */
  async getRecentEvents(limit: number = 100): Promise<AuditEvent[]> {
    if (!this.redis) return [];

    try {
      const events = await this.redis.lRange(this.AUDIT_LOG_KEY, 0, limit - 1);
      return events.map(event => JSON.parse(event));
    } catch (error) {
      logger.error('Error fetching recent audit events:', error);
      return [];
    }
  }

  /**
   * Get user activity
   */
  async getUserActivity(
    userId: number,
    limit: number = 50
  ): Promise<AuditEvent[]> {
    if (!this.redis) return [];

    try {
      const userKey = `${this.USER_ACTIVITY_KEY}:${userId}`;
      const events = await this.redis.lRange(userKey, 0, limit - 1);
      return events.map(event => JSON.parse(event));
    } catch (error) {
      logger.error('Error fetching user activity:', error);
      return [];
    }
  }

  /**
   * Get security events
   */
  async getSecurityEvents(limit: number = 100): Promise<SecurityEvent[]> {
    if (!this.redis) return [];

    try {
      const events = await this.redis.lRange(
        this.SECURITY_LOG_KEY,
        0,
        limit - 1
      );
      return events.map(event => JSON.parse(event));
    } catch (error) {
      logger.error('Error fetching security events:', error);
      return [];
    }
  }

  /**
   * Search events by criteria
   */
  async searchEvents(
    criteria: {
      userId?: number;
      action?: string;
      success?: boolean;
      startTime?: Date;
      endTime?: Date;
    },
    limit: number = 100
  ): Promise<AuditEvent[]> {
    const events = await this.getRecentEvents(limit * 2); // Get more to filter

    return events
      .filter(event => {
        if (criteria.userId && event.userId !== criteria.userId) return false;
        if (criteria.action && event.action !== criteria.action) return false;
        if (
          criteria.success !== undefined &&
          event.success !== criteria.success
        )
          return false;

        if (criteria.startTime || criteria.endTime) {
          const eventTime = new Date(event.timestamp);
          if (criteria.startTime && eventTime < criteria.startTime)
            return false;
          if (criteria.endTime && eventTime > criteria.endTime) return false;
        }

        return true;
      })
      .slice(0, limit);
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<{
    totalEvents: number;
    securityEvents: number;
    recentFailures: number;
    topActions: Array<{ action: string; count: number }>;
  }> {
    if (!this.redis) {
      return {
        totalEvents: 0,
        securityEvents: 0,
        recentFailures: 0,
        topActions: [],
      };
    }

    try {
      const [totalEvents, securityEvents] = await Promise.all([
        this.redis.lLen(this.AUDIT_LOG_KEY),
        this.redis.lLen(this.SECURITY_LOG_KEY),
      ]);

      const recentEvents = await this.getRecentEvents(100);
      const recentFailures = recentEvents.filter(e => !e.success).length;

      // Count actions
      const actionCounts: Record<string, number> = {};
      recentEvents.forEach(event => {
        actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
      });

      const topActions = Object.entries(actionCounts)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalEvents,
        securityEvents,
        recentFailures,
        topActions,
      };
    } catch (error) {
      logger.error('Error getting audit stats:', error);
      return {
        totalEvents: 0,
        securityEvents: 0,
        recentFailures: 0,
        topActions: [],
      };
    }
  }

  /**
   * Cleanup old events (maintenance task)
   */
  async cleanup(): Promise<void> {
    if (!this.redis) return;

    try {
      await Promise.all([
        this.redis.lTrim(this.AUDIT_LOG_KEY, 0, this.MAX_LOG_ENTRIES - 1),
        this.redis.lTrim(this.SECURITY_LOG_KEY, 0, this.MAX_LOG_ENTRIES - 1),
      ]);

      logger.info('Audit log cleanup completed');
    } catch (error) {
      logger.error('Error during audit log cleanup:', error);
    }
  }

  /**
   * Graceful shutdown
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
      logger.info('AuditLogger Redis disconnected');
    }
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
export default AuditLogger;
