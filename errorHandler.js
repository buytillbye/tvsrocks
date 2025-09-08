/**
 * @fileoverview Centralized error handling utilities
 */

import { createLogger } from './logger.js';

/**
 * @typedef {Object} ErrorContext
 * @property {string} component - Component where error occurred
 * @property {string} operation - Operation that failed
 * @property {Object} [metadata] - Additional error metadata
 */

/**
 * @typedef {Object} ErrorHandler
 * @property {Function} handle - Handle an error with context
 * @property {Function} wrap - Wrap a function with error handling
 * @property {Function} wrapAsync - Wrap an async function with error handling
 */

/**
 * Creates a centralized error handler
 * @param {Object} logger - Logger instance
 * @returns {ErrorHandler} Error handler instance
 */
export const createErrorHandler = (logger) => {
  /**
   * Handles an error with proper logging and context
   * @param {Error} error - Error to handle
   * @param {ErrorContext} context - Error context
   * @returns {void}
   */
  const handle = (error, context) => {
    const { component, operation, metadata = {} } = context;
    
    logger.error(component, `${operation} failed: ${error.message}`, {
      stack: error.stack,
      name: error.name,
      ...metadata
    });
  };

  /**
   * Wraps a synchronous function with error handling
   * @param {Function} fn - Function to wrap
   * @param {ErrorContext} context - Error context
   * @returns {Function} Wrapped function
   */
  const wrap = (fn, context) => (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      handle(error, context);
      throw error;
    }
  };

  /**
   * Wraps an async function with error handling
   * @param {Function} asyncFn - Async function to wrap
   * @param {ErrorContext} context - Error context
   * @returns {Function} Wrapped async function
   */
  const wrapAsync = (asyncFn, context) => async (...args) => {
    try {
      return await asyncFn(...args);
    } catch (error) {
      handle(error, context);
      throw error;
    }
  };

  return Object.freeze({
    handle,
    wrap,
    wrapAsync
  });
};

/**
 * Creates application-specific error types
 */
export class TelegramError extends Error {
  constructor(message, code, description) {
    super(message);
    this.name = 'TelegramError';
    this.code = code;
    this.description = description;
  }
}

export class TradingViewError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'TradingViewError';
    this.status = status;
    this.response = response;
  }
}

export class ValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class ConfigurationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ConfigurationError';
    this.field = field;
  }
}

/**
 * Creates a global error handler for the application
 * @param {Object} telegramService - Telegram service for error notifications
 * @param {Object} logger - Logger instance
 * @returns {Function} Global error handler
 */
export const createGlobalErrorHandler = (telegramService, logger) => {
  return async (error, context = {}) => {
    logger.error('GLOBAL', `Unhandled error: ${error.message}`, {
      stack: error.stack,
      name: error.name,
      ...context
    });

    // Send critical errors to Telegram
    if (error instanceof ConfigurationError || 
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('timeout')) {
      try {
        await telegramService.sendMessage(
          `🚨 Critical Error: ${error.message}\nComponent: ${context.component || 'Unknown'}`
        );
      } catch (notificationError) {
        logger.error('GLOBAL', `Failed to send error notification: ${notificationError.message}`);
      }
    }
  };
};
