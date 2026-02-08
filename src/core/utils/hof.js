/**
 * @fileoverview Higher-order functions for functional programming patterns
 */

import { nowTs } from './time.js';

/**
 * @typedef {Function} AsyncFunction
 * @param {...any} args - Function arguments
 * @returns {Promise<any>} Promise result
 */

/**
 * Wraps an async function with retry logic
 * @param {AsyncFunction} asyncFn - Async function to wrap
 * @param {number} [maxRetries=2] - Maximum number of retries
 * @returns {AsyncFunction} Function with retry capability
 */
export const withRetry = (asyncFn, maxRetries = 2) => async (...args) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await asyncFn(...args);
        } catch (error) {
            if (attempt === maxRetries) throw error;
            console.warn(`Retry ${attempt + 1}/${maxRetries + 1} failed:`, error.message);
        }
    }
};

/**
 * Wraps a function with logging capabilities
 * @param {Function} fn - Function to wrap
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Function} Function with logging
 */
export const withLogging = (fn, logPrefix) => (...args) => {
    const ts = nowTs();
    console.log(`[${ts}] ${logPrefix}...`);
    const result = fn(...args);

    if (result instanceof Promise) {
        return result
            .then(res => {
                console.log(`[${ts}] ✓ ${logPrefix} completed`);
                return res;
            })
            .catch(err => {
                console.error(`[${ts}] ✖ ${logPrefix} failed:`, err.message);
                throw err;
            });
    }

    console.log(`[${ts}] ✓ ${logPrefix} completed`);
    return result;
};

/**
 * Creates a debounced version of a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

/**
 * Creates a throttled version of a function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = (fn, limit) => {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};
