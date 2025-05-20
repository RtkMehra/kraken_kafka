import winston from 'winston';
import fs from 'fs';
import path from 'path';
import config from '../config/env.js';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Define custom log levels
const levels = {
    error: 0,    // System errors, critical issues
    warn: 1,     // Important warnings, potential issues
    info: 2,     // Key business events
    debug: 3,    // Development only
};

// Create formatter for objects
const formatObject = (param) => {
    if (param instanceof Error) {
        return param.stack;
    }
    if (typeof param === 'object') {
        return JSON.stringify(param, null, 2);
    }
    return param;
};

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
        // Only include meta if it's not empty and not already in message
        const metaStr = Object.keys(meta).length > 0 && meta.stack !== message
            ? ` | ${JSON.stringify(meta)}`
            : '';
        return `${timestamp} ${level}: ${message}${metaStr}`;
    })
);

// Production settings
const productionSettings = {
    level: config.LOG_LEVEL || 'info',
    silent: process.env.NODE_ENV === 'test',
    handleExceptions: true,
    handleRejections: true,
};

// Create logger
const logger = winston.createLogger({
    levels,
    format: logFormat,
    transports: [
        // Console transport
        new winston.transports.Console(productionSettings),

        // File transport for errors
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),

        // File transport for all logs
        new winston.transports.File({
            filename: path.join(logsDir, 'application.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

// Add convenience methods for structured logging
logger.startOperation = (operation) => {
    if (operation === 'kraken-connect') {
        logger.info('Establishing Kraken connection');
    }
};

logger.endOperation = (operation) => {
    if (operation === 'kraken-connect') {
        logger.info('Kraken connection established');
    }
};

logger.failOperation = (operation, error) => {
    logger.error(`Failed ${operation}`, { error });
};

export default logger;
