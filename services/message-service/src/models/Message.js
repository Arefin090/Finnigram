const { pool } = require('../utils/database');
const logger = require('../utils/logger');

class Message {
  static async create({ conversationId, senderId, content, messageType = 'text', replyTo = null, attachments = [] }) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create message
      const messageResult = await client.query(
        `INSERT INTO messages (conversation_id, sender_id, content, message_type, reply_to) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [conversationId, senderId, content, messageType, replyTo]
      );
      
      const message = messageResult.rows[0];
      
      // Add attachments if any
      for (const attachment of attachments) {
        await client.query(
          `INSERT INTO message_attachments (message_id, file_url, file_name, file_size, mime_type) 
           VALUES ($1, $2, $3, $4, $5)`,
          [message.id, attachment.fileUrl, attachment.fileName, attachment.fileSize, attachment.mimeType]
        );
      }
      
      // Update conversation's updated_at
      await client.query(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
      );
      
      await client.query('COMMIT');
      
      logger.info(`Message created: ${message.id} in conversation ${conversationId}`);
      return message;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error creating message:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getConversationMessages(conversationId, limit = 50, offset = 0) {
    try {
      const result = await pool.query(`
        SELECT 
          m.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', ma.id,
                'fileUrl', ma.file_url,
                'fileName', ma.file_name,
                'fileSize', ma.file_size,
                'mimeType', ma.mime_type
              )
            ) FILTER (WHERE ma.id IS NOT NULL), 
            '[]'
          ) as attachments,
          CASE 
            WHEN m.reply_to IS NOT NULL THEN
              JSON_BUILD_OBJECT(
                'id', rm.id,
                'content', rm.content,
                'senderId', rm.sender_id,
                'createdAt', rm.created_at
              )
            ELSE NULL
          END as reply_message
        FROM messages m
        LEFT JOIN message_attachments ma ON m.id = ma.message_id
        LEFT JOIN messages rm ON m.reply_to = rm.id
        WHERE m.conversation_id = $1 AND m.deleted_at IS NULL
        GROUP BY m.id, rm.id, rm.content, rm.sender_id, rm.created_at
        ORDER BY m.created_at DESC
        LIMIT $2 OFFSET $3
      `, [conversationId, limit, offset]);
      
      return result.rows.reverse(); // Return in chronological order
    } catch (error) {
      logger.error('Error getting conversation messages:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await pool.query(`
        SELECT 
          m.*,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', ma.id,
                'fileUrl', ma.file_url,
                'fileName', ma.file_name,
                'fileSize', ma.file_size,
                'mimeType', ma.mime_type
              )
            ) FILTER (WHERE ma.id IS NOT NULL), 
            '[]'
          ) as attachments
        FROM messages m
        LEFT JOIN message_attachments ma ON m.id = ma.message_id
        WHERE m.id = $1 AND m.deleted_at IS NULL
        GROUP BY m.id
      `, [id]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding message:', error);
      throw error;
    }
  }

  static async update(id, content) {
    try {
      const result = await pool.query(
        `UPDATE messages 
         SET content = $1, edited_at = CURRENT_TIMESTAMP 
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING *`,
        [content, id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Message not found or already deleted');
      }
      
      logger.info(`Message updated: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating message:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const result = await pool.query(
        `UPDATE messages 
         SET deleted_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [id]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Message not found or already deleted');
      }
      
      logger.info(`Message deleted: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error deleting message:', error);
      throw error;
    }
  }

  static async searchMessages(userId, query, limit = 20) {
    try {
      const result = await pool.query(`
        SELECT m.*, c.name as conversation_name
        FROM messages m
        JOIN conversations c ON m.conversation_id = c.id
        JOIN conversation_participants cp ON c.id = cp.conversation_id
        WHERE cp.user_id = $1 
          AND m.deleted_at IS NULL
          AND m.content ILIKE $2
        ORDER BY m.created_at DESC
        LIMIT $3
      `, [userId, `%${query}%`, limit]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error searching messages:', error);
      throw error;
    }
  }
}

module.exports = Message;