import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'messages_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_CACHED_MESSAGES = 50; // Limit cache size per conversation

// Cache versioning for schema safety
const CACHE_VERSION = '1.0.0';
const VERSION_KEY = 'cache_version';

// Type definitions for better type safety
interface Message {
  id: string | number;
  content: string;
  sender_id: number;
  conversation_id: number;
  message_type: string;
  created_at: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: any[];
  delivered_at?: string | null;
  read_at?: string | null;
}

interface CacheData {
  version: string;
  messages: Message[];
  timestamp: number;
  conversationId: number;
  checksum?: string; // For data integrity validation
}

interface CacheInfo {
  conversationId: number;
  messageCount: number;
  cached: string;
  isExpired: boolean;
}

class MessageCache {
  // Get cache key for a conversation
  private getCacheKey(conversationId: number): string {
    return `${CACHE_PREFIX}${conversationId}`;
  }

  // Generate simple checksum for data integrity
  private generateChecksum(data: any): string {
    return JSON.stringify(data).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0).toString();
  }

  // Check if cache version is compatible
  private async checkCacheVersion(): Promise<boolean> {
    try {
      const storedVersion = await AsyncStorage.getItem(VERSION_KEY);
      if (!storedVersion || storedVersion !== CACHE_VERSION) {
        console.log(`🔄 Cache version mismatch. Stored: ${storedVersion}, Current: ${CACHE_VERSION}`);
        return false;
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to check cache version:', error);
      return false;
    }
  }

  // Initialize cache version
  private async initializeCacheVersion(): Promise<void> {
    try {
      await AsyncStorage.setItem(VERSION_KEY, CACHE_VERSION);
      console.log(`✅ Cache version initialized: ${CACHE_VERSION}`);
    } catch (error) {
      console.error('❌ Failed to initialize cache version:', error);
    }
  }

  // Cache messages for a conversation
  async cacheMessages(conversationId: number, messages: Message[]): Promise<void> {
    try {
      // Ensure cache version is initialized
      const isVersionValid = await this.checkCacheVersion();
      if (!isVersionValid) {
        await this.clearAllCache();
        await this.initializeCacheVersion();
      }

      const limitedMessages = messages.slice(0, MAX_CACHED_MESSAGES);
      const cacheData: CacheData = {
        version: CACHE_VERSION,
        messages: limitedMessages,
        timestamp: Date.now(),
        conversationId,
        checksum: this.generateChecksum(limitedMessages)
      };
      
      const cacheKey = this.getCacheKey(conversationId);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
      
      console.log(`📦 Cached ${messages.length} messages for conversation ${conversationId} (v${CACHE_VERSION})`);
    } catch (error) {
      console.error('❌ Failed to cache messages:', error);
    }
  }

  // Get cached messages for a conversation
  async getCachedMessages(conversationId: number): Promise<Message[] | null> {
    try {
      const cacheKey = this.getCacheKey(conversationId);
      const cachedData = await AsyncStorage.getItem(cacheKey);
      
      if (!cachedData) {
        console.log(`📭 No cached messages for conversation ${conversationId}`);
        return null;
      }

      const parsed: CacheData = JSON.parse(cachedData);
      
      // Version validation
      if (!parsed.version || parsed.version !== CACHE_VERSION) {
        console.log(`🔄 Cache version mismatch for conversation ${conversationId}. Clearing cache.`);
        await this.clearCache(conversationId);
        return null;
      }

      // Expiry check
      const isExpired = Date.now() - parsed.timestamp > CACHE_EXPIRY;
      if (isExpired) {
        console.log(`⏰ Cache expired for conversation ${conversationId}`);
        await this.clearCache(conversationId);
        return null;
      }

      // Data integrity check
      if (parsed.checksum) {
        const expectedChecksum = this.generateChecksum(parsed.messages);
        if (parsed.checksum !== expectedChecksum) {
          console.log(`⚠️ Cache data corruption detected for conversation ${conversationId}. Clearing cache.`);
          await this.clearCache(conversationId);
          return null;
        }
      }

      console.log(`📦 Retrieved ${parsed.messages.length} cached messages for conversation ${conversationId} (v${parsed.version})`);
      return parsed.messages;
    } catch (error) {
      console.error('❌ Failed to get cached messages:', error);
      return null;
    }
  }

  // Add a new message to cache
  async addMessageToCache(conversationId: number, message: Message): Promise<void> {
    try {
      const cachedMessages = await this.getCachedMessages(conversationId);
      if (!cachedMessages) return;

      // Add new message to the beginning (most recent first)
      const updatedMessages = [message, ...cachedMessages].slice(0, MAX_CACHED_MESSAGES);
      await this.cacheMessages(conversationId, updatedMessages);
      
      console.log(`📦 Added new message to cache for conversation ${conversationId}`);
    } catch (error) {
      console.error('❌ Failed to add message to cache:', error);
    }
  }

  // Update an existing message in cache
  async updateMessageInCache(conversationId: number, messageId: string | number, updatedMessage: Partial<Message>): Promise<void> {
    try {
      const cachedMessages = await this.getCachedMessages(conversationId);
      if (!cachedMessages) return;

      const updatedMessages = cachedMessages.map(msg => 
        msg.id === messageId ? { ...msg, ...updatedMessage } : msg
      );

      await this.cacheMessages(conversationId, updatedMessages);
      console.log(`📝 Updated message ${messageId} in cache for conversation ${conversationId}`);
    } catch (error) {
      console.error('❌ Failed to update message in cache:', error);
    }
  }

  // Remove a message from cache
  async deleteMessageFromCache(conversationId: number, messageId: string | number): Promise<void> {
    try {
      const cachedMessages = await this.getCachedMessages(conversationId);
      if (!cachedMessages) return;

      const filteredMessages = cachedMessages.filter(msg => msg.id !== messageId);
      await this.cacheMessages(conversationId, filteredMessages);
      console.log(`🗑️ Deleted message ${messageId} from cache for conversation ${conversationId}`);
    } catch (error) {
      console.error('❌ Failed to delete message from cache:', error);
    }
  }

  // Clear cache for a specific conversation
  async clearCache(conversationId: number): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(conversationId);
      await AsyncStorage.removeItem(cacheKey);
      console.log(`🗑️ Cleared cache for conversation ${conversationId}`);
    } catch (error) {
      console.error('❌ Failed to clear cache:', error);
    }
  }

  // Force refresh cache from API (for conflict resolution)
  async refreshCacheFromAPI(conversationId: number, freshMessages: Message[]): Promise<void> {
    try {
      await this.clearCache(conversationId);
      await this.cacheMessages(conversationId, freshMessages);
      console.log(`🔄 Refreshed cache from API for conversation ${conversationId}`);
    } catch (error) {
      console.error('❌ Failed to refresh cache from API:', error);
    }
  }

  // Clear all message cache
  async clearAllCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messageCacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      
      if (messageCacheKeys.length > 0) {
        await AsyncStorage.multiRemove(messageCacheKeys);
        console.log(`🗑️ Cleared ${messageCacheKeys.length} message caches`);
      }
    } catch (error) {
      console.error('❌ Failed to clear all cache:', error);
    }
  }

  // Get cache info (for debugging)
  async getCacheInfo(): Promise<CacheInfo[]> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messageCacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      
      const cacheInfo: CacheInfo[] = [];
      for (const key of messageCacheKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          const parsed: CacheData = JSON.parse(data);
          cacheInfo.push({
            conversationId: parsed.conversationId,
            messageCount: parsed.messages.length,
            cached: new Date(parsed.timestamp).toLocaleString(),
            isExpired: Date.now() - parsed.timestamp > CACHE_EXPIRY
          });
        }
      }
      
      return cacheInfo;
    } catch (error) {
      console.error('❌ Failed to get cache info:', error);
      return [];
    }
  }

  // Get cache size and performance metrics
  async getCacheMetrics(): Promise<{
    totalConversations: number;
    totalMessages: number;
    totalSize: number;
    expiredCaches: number;
    corruptedCaches: number;
    oldestCache?: string;
    newestCache?: string;
  }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messageCacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      
      let totalMessages = 0;
      let totalSize = 0;
      let expiredCaches = 0;
      let corruptedCaches = 0;
      let oldestTimestamp = Date.now();
      let newestTimestamp = 0;

      for (const key of messageCacheKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          try {
            const parsed: CacheData = JSON.parse(data);
            totalMessages += parsed.messages.length;
            totalSize += data.length;
            
            if (Date.now() - parsed.timestamp > CACHE_EXPIRY) {
              expiredCaches++;
            }
            
            if (parsed.checksum) {
              const expectedChecksum = this.generateChecksum(parsed.messages);
              if (parsed.checksum !== expectedChecksum) {
                corruptedCaches++;
              }
            }
            
            if (parsed.timestamp < oldestTimestamp) {
              oldestTimestamp = parsed.timestamp;
            }
            if (parsed.timestamp > newestTimestamp) {
              newestTimestamp = parsed.timestamp;
            }
          } catch (parseError) {
            corruptedCaches++;
          }
        }
      }

      return {
        totalConversations: messageCacheKeys.length,
        totalMessages,
        totalSize,
        expiredCaches,
        corruptedCaches,
        oldestCache: oldestTimestamp < Date.now() ? new Date(oldestTimestamp).toLocaleString() : undefined,
        newestCache: newestTimestamp > 0 ? new Date(newestTimestamp).toLocaleString() : undefined
      };
    } catch (error) {
      console.error('❌ Failed to get cache metrics:', error);
      return {
        totalConversations: 0,
        totalMessages: 0,
        totalSize: 0,
        expiredCaches: 0,
        corruptedCaches: 0
      };
    }
  }

  // Cleanup expired and corrupted caches
  async cleanupCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const messageCacheKeys = keys.filter(key => key.startsWith(CACHE_PREFIX));
      
      let cleanedCount = 0;
      
      for (const key of messageCacheKeys) {
        const data = await AsyncStorage.getItem(key);
        if (data) {
          try {
            const parsed: CacheData = JSON.parse(data);
            
            // Remove expired caches
            if (Date.now() - parsed.timestamp > CACHE_EXPIRY) {
              await AsyncStorage.removeItem(key);
              cleanedCount++;
              continue;
            }
            
            // Remove corrupted caches
            if (parsed.checksum) {
              const expectedChecksum = this.generateChecksum(parsed.messages);
              if (parsed.checksum !== expectedChecksum) {
                await AsyncStorage.removeItem(key);
                cleanedCount++;
                continue;
              }
            }
            
            // Remove version mismatched caches
            if (!parsed.version || parsed.version !== CACHE_VERSION) {
              await AsyncStorage.removeItem(key);
              cleanedCount++;
            }
          } catch (parseError) {
            // Remove corrupted cache entries
            await AsyncStorage.removeItem(key);
            cleanedCount++;
          }
        }
      }
      
      console.log(`🧹 Cleaned up ${cleanedCount} cache entries`);
    } catch (error) {
      console.error('❌ Failed to cleanup cache:', error);
    }
  }
}

export default new MessageCache();
export type { Message, CacheData, CacheInfo };