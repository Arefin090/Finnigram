import winston from 'winston';
import fs from 'fs';
import path from 'path';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'message-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Only add file transports in non-ephemeral environments
if (
  process.env.NODE_ENV !== 'production' ||
  process.env.ENABLE_FILE_LOGGING === 'true'
) {
  try {
    logger.add(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      })
    );
    logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
  } catch (error) {
    // Use stderr directly since logger might not be fully initialized
    process.stderr.write(`Could not create file transports: ${error}\n`);
  }
}

export default logger;
