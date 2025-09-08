/**
 * @fileoverview Centralized logging system with structured logging
 */

import { nowTs } from './utils/time.js';

/**
 * @typedef {Object} LogLevel
 * @property {string} DEBUG - Debug level
 * @property {string} INFO - Info level  
 * @property {string} WARN - Warning level
 * @property {string} ERROR - Error level
 */

/**
 * Log levels enumeration
 */
export const LOG_LEVELS = Object.freeze({
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
});

/**
 * @typedef {Object} Logger
 * @property {Function} debug - Log debug message
 * @property {Function} info - Log info message
 * @property {Function} warn - Log warning message
 * @property {Function} error - Log error message
 * @property {Function} telegram - Log telegram-specific message
 * @property {Function} tradingview - Log TradingView-specific message
 * @property {Function} scanner - Log scanner-specific message
 */

/**
 * Creates a structured logger with different levels
 * @param {string} [minLevel='INFO'] - Minimum log level to output
 * @returns {Logger} Logger instance
 */
export const createLogger = (minLevel = LOG_LEVELS.INFO) => {
  const levelPriority = {
    [LOG_LEVELS.DEBUG]: 0,
    [LOG_LEVELS.INFO]: 1,
    [LOG_LEVELS.WARN]: 2,
    [LOG_LEVELS.ERROR]: 3
  };

  const shouldLog = (level) => levelPriority[level] >= levelPriority[minLevel];

  const formatMessage = (level, component, message, extra = {}) => {
    const timestamp = nowTs();
    const baseMsg = `[${timestamp}] [${level}] [${component}] ${message}`;
    
    if (Object.keys(extra).length > 0) {
      return `${baseMsg} ${JSON.stringify(extra)}`;
    }
    return baseMsg;
  };

  const log = (level, component, message, extra) => {
    if (!shouldLog(level)) return;
    
    const formattedMsg = formatMessage(level, component, message, extra);
    
    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(formattedMsg);
        break;
      case LOG_LEVELS.WARN:
        console.warn(formattedMsg);
        break;
      default:
        console.log(formattedMsg);
    }
  };

  return Object.freeze({
    debug: (component, message, extra) => log(LOG_LEVELS.DEBUG, component, message, extra),
    info: (component, message, extra) => log(LOG_LEVELS.INFO, component, message, extra),
    warn: (component, message, extra) => log(LOG_LEVELS.WARN, component, message, extra),
    error: (component, message, extra) => log(LOG_LEVELS.ERROR, component, message, extra),
    
    // Specialized loggers for different components
    telegram: {
      sent: (messageId, chatId, threadId) => log(LOG_LEVELS.INFO, 'TG', 
        `sent ✔ id=${messageId} chat=${chatId}${threadId ? ` thread=${threadId}` : ''}`),
      error: (code, description) => log(LOG_LEVELS.ERROR, 'TG', 
        `send error (${code}): ${description}`),
      retry: () => log(LOG_LEVELS.WARN, 'TG', 'retrying without THREAD_ID…'),
      retryFailed: (description) => log(LOG_LEVELS.ERROR, 'TG', 
        `retry failed: ${description}`)
    },
    
    tradingview: {
      request: (attempt, maxAttempts) => log(LOG_LEVELS.INFO, 'TV', 
        `→ TV request (try ${attempt}/${maxAttempts})`),
      response: (status, length) => log(LOG_LEVELS.INFO, 'TV', 
        `← TV status=${status} len=${length}`),
      success: (duration, totalCount, rows) => log(LOG_LEVELS.INFO, 'TV', 
        `✓ TV ok in ${duration}ms, totalCount=${totalCount}, rows=${rows}`),
      error: (message) => log(LOG_LEVELS.ERROR, 'TV', `✖ fetch error: ${message}`),
      retry: (waitMs) => log(LOG_LEVELS.INFO, 'TV', `⏳ retry in ${waitMs}ms`)
    },
    
    scanner: {
      start: () => log(LOG_LEVELS.INFO, 'SCANNER', '== scanner START =='),
      stop: () => log(LOG_LEVELS.INFO, 'SCANNER', '== scanner STOP =='),
      newStock: (symbol, change) => log(LOG_LEVELS.INFO, 'SCANNER', 
        `🔔 новий: ${symbol}, change=${change}%`),
      noData: () => log(LOG_LEVELS.INFO, 'SCANNER', '(порожньо)'),
      noNewStocks: () => log(LOG_LEVELS.INFO, 'SCANNER', '0 нових символів'),
      bootstrapSuppressed: (count) => log(LOG_LEVELS.INFO, 'SCANNER', 
        `bootstrap suppressed: ${count} нових`),
      premarket: (weekday, time, status) => log(LOG_LEVELS.INFO, 'GATE', 
        `NY ${weekday} ${time} → premarket=${status ? "YES" : "NO"}`)
    }
  });
};
