const bcrypt = require('bcryptjs');
const { pool } = require('../utils/database');
const logger = require('../utils/logger');

class User {
  static async create({ email, username, password, displayName }) {
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const result = await pool.query(
        `INSERT INTO users (email, username, password_hash, display_name) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, email, username, display_name, created_at`,
        [email, username, hashedPassword, displayName || username]
      );
      
      logger.info(`User created: ${username}`);
      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new Error('Email or username already exists');
      }
      logger.error('User creation failed:', error);
      throw error;
    }
  }

  static async findByEmail(email) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by email:', error);
      throw error;
    }
  }

  static async findByUsername(username) {
    try {
      const result = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by username:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const result = await pool.query(
        'SELECT id, email, username, display_name, avatar_url, is_online, last_seen, created_at FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding user by id:', error);
      throw error;
    }
  }

  static async validatePassword(user, password) {
    return await bcrypt.compare(password, user.password_hash);
  }

  static async updateOnlineStatus(userId, isOnline) {
    try {
      await pool.query(
        'UPDATE users SET is_online = $1, last_seen = CURRENT_TIMESTAMP WHERE id = $2',
        [isOnline, userId]
      );
    } catch (error) {
      logger.error('Error updating online status:', error);
      throw error;
    }
  }

  static async searchUsers(query, limit = 10) {
    try {
      const result = await pool.query(
        `SELECT id, username, display_name, avatar_url, is_online 
         FROM users 
         WHERE username ILIKE $1 OR display_name ILIKE $1 
         LIMIT $2`,
        [`%${query}%`, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error searching users:', error);
      throw error;
    }
  }
}

module.exports = User;