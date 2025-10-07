/**
 * @fileoverview Data validation utilities for API responses and configuration
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {string[]} errors - Array of validation error messages
 */

/**
 * Validates TradingView API response structure (test)
 * @param {any} data - Response data to validate
 * @returns {ValidationResult} Validation result
 */
export const validateTradingViewResponse = (data) => {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Response must be an object');
    return { isValid: false, errors };
  }
  
  if (!Array.isArray(data.data)) {
    errors.push('Response must have data array');
  }
  
  if (typeof data.totalCount !== 'number') {
    errors.push('Response must have totalCount number');
  }
  
  return { isValid: errors.length === 0, errors };
};

/**
 * Validates stock data object structure
 * @param {any} stock - Stock data to validate
 * @returns {ValidationResult} Validation result
 */
export const validateStockData = (stock) => {
  const errors = [];
  
  if (!stock || typeof stock !== 'object') {
    errors.push('Stock must be an object');
    return { isValid: false, errors };
  }
  
  if (typeof stock.symbol !== 'string' || !stock.symbol.trim()) {
    errors.push('Stock must have valid symbol string');
  }
  
  if (typeof stock.premarket_change !== 'number' || isNaN(stock.premarket_change)) {
    errors.push('Stock must have valid premarket_change number');
  }
  
  if (typeof stock.float_shares_outstanding !== 'number' || isNaN(stock.float_shares_outstanding)) {
    errors.push('Stock must have valid float_shares_outstanding number');
  }
  
  if (typeof stock.premarket_volume !== 'number' || isNaN(stock.premarket_volume)) {
    errors.push('Stock must have valid premarket_volume number');
  }
  
  return { isValid: errors.length === 0, errors };
};

/**
 * Validates configuration object
 * @param {any} config - Configuration to validate
 * @returns {ValidationResult} Validation result
 */
export const validateConfig = (config) => {
  const errors = [];
  
  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return { isValid: false, errors };
  }
  
  if (!config.botToken || typeof config.botToken !== 'string') {
    errors.push('Config must have valid botToken string');
  }
  
  if (!config.chatId || (typeof config.chatId !== 'string' && typeof config.chatId !== 'number')) {
    errors.push('Config must have valid chatId string or number');
  }
  
  if (config.premarketThreshold !== undefined && 
      (typeof config.premarketThreshold !== 'number' || config.premarketThreshold <= 0)) {
    errors.push('Config premarketThreshold must be positive number');
  }
  
  if (config.scanIntervalMs !== undefined && 
      (typeof config.scanIntervalMs !== 'number' || config.scanIntervalMs <= 0)) {
    errors.push('Config scanIntervalMs must be positive number');
  }
  
  return { isValid: errors.length === 0, errors };
};

/**
 * Validates Telegram message parameters
 * @param {string} text - Message text
 * @param {string|number} chatId - Chat ID
 * @param {string|number} [threadId] - Optional thread ID
 * @returns {ValidationResult} Validation result
 */
export const validateTelegramMessage = (text, chatId, threadId) => {
  const errors = [];
  
  if (!text || typeof text !== 'string' || !text.trim()) {
    errors.push('Message text must be non-empty string');
  }
  
  if (!chatId || (typeof chatId !== 'string' && typeof chatId !== 'number')) {
    errors.push('Chat ID must be string or number');
  }
  
  if (threadId !== undefined && threadId !== null && 
      typeof threadId !== 'string' && typeof threadId !== 'number') {
    errors.push('Thread ID must be string, number, or undefined');
  }
  
  return { isValid: errors.length === 0, errors };
};

/**
 * Validates array of stock symbols
 * @param {any} symbols - Symbols to validate
 * @returns {ValidationResult} Validation result
 */
export const validateStockSymbols = (symbols) => {
  const errors = [];
  
  if (!Array.isArray(symbols)) {
    errors.push('Symbols must be an array');
    return { isValid: false, errors };
  }
  
  symbols.forEach((symbol, index) => {
    if (typeof symbol !== 'string' || !symbol.trim()) {
      errors.push(`Symbol at index ${index} must be non-empty string`);
    }
  });
  
  return { isValid: errors.length === 0, errors };
};
