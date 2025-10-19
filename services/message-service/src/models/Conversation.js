const { pool } = require('../utils/database');
const logger = require('../utils/logger');

class Conversation {
  static async create({ type = 'direct', name, description, createdBy, participants = [] }) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create conversation
      const conversationResult = await client.query(
        `INSERT INTO conversations (type, name, description, created_by) 
         VALUES ($1, $2, $3, $4) 
         RETURNING *`,
        [type, name, description, createdBy]
      );
      
      const conversation = conversationResult.rows[0];
      
      // Add creator as admin
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role) 
         VALUES ($1, $2, 'admin')`,
        [conversation.id, createdBy]
      );
      
      // Add other participants
      for (const userId of participants) {
        if (userId !== createdBy) {
          await client.query(
            `INSERT INTO conversation_participants (conversation_id, user_id, role) 
             VALUES ($1, $2, 'member')`,
            [conversation.id, userId]
          );
        }
      }
      
      await client.query('COMMIT');
      
      logger.info(`Conversation created: ${conversation.id}`);
      return conversation;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating conversation:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async findById(id) {
    try {
      const result = await pool.query(
        'SELECT * FROM conversations WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding conversation:', error);
      throw error;
    }
  }

  static async getUserConversations(userId) {
    try {
      const result = await pool.query(`
        SELECT 
          c.*,
          cp.last_read_at,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.created_at > COALESCE(cp.last_read_at, '1970-01-01')) as unread_count,
          (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
          (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
        FROM conversations c
        JOIN conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.user_id = $1
        ORDER BY COALESCE(last_message_at, c.created_at) DESC
      `, [userId]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      throw error;
    }
  }

  static async getParticipants(conversationId) {
    try {
      const result = await pool.query(`
        SELECT cp.user_id, cp.role, cp.joined_at, cp.last_read_at
        FROM conversation_participants cp
        WHERE cp.conversation_id = $1
      `, [conversationId]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting conversation participants:', error);
      throw error;
    }
  }

  static async addParticipant(conversationId, userId, role = 'member') {
    try {
      await pool.query(
        `INSERT INTO conversation_participants (conversation_id, user_id, role) 
         VALUES ($1, $2, $3)
         ON CONFLICT (conversation_id, user_id) DO NOTHING`,
        [conversationId, userId, role]
      );
      
      logger.info(`User ${userId} added to conversation ${conversationId}`);
    } catch (error) {
      logger.error('Error adding participant:', error);
      throw error;
    }
  }

  static async removeParticipant(conversationId, userId) {
    try {
      await pool.query(
        'DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      
      logger.info(`User ${userId} removed from conversation ${conversationId}`);
    } catch (error) {
      logger.error('Error removing participant:', error);
      throw error;
    }
  }

  static async updateLastRead(conversationId, userId) {
    try {
      await pool.query(
        'UPDATE conversation_participants SET last_read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, userId]
      );
    } catch (error) {
      logger.error('Error updating last read:', error);
      throw error;
    }
  }

  static async isParticipant(conversationId, userId) {
    try {
      const result = await pool.query(
        'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
        [conversationId, userId]
      );
      return result.rows.length > 0;
    } catch (error) {
      logger.error('Error checking participant:', error);
      throw error;
    }
  }
}

module.exports = Conversation;