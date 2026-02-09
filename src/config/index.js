/**
 * @fileoverview Configuration management for the stock watcher
 */
import "dotenv/config";

/**
 * @typedef {Object} Config
 * @property {string} botToken - Telegram bot token
 * @property {string|number} chatId - Telegram chat ID
 * @property {number|null} threadId - Optional Telegram thread ID
 * @property {number} premarketThreshold - Percentage threshold for stock alerts
 * @property {number} scanIntervalMs - Scan interval in milliseconds
 * @property {boolean} sendOnStartup - Whether to send all stocks on startup
 * @property {number} rvolThreshold - RVOL surge threshold
 * @property {number} rvolIntervalMs - RVOL scan interval
 * @property {number} rvolAlertStep - Increment step for repeated alerts
 * @property {number} premarketAlertStep - Increment step for premarket growth alerts
 * @property {Object} premarketHours - Premarket trading hours
 * @property {string} premarketHours.start - Start time (HH:MM)
 * @property {string} premarketHours.end - End time (HH:MM)
 * @property {Object} timeouts - Various timeout configurations
 * @property {number} timeouts.launchTimeoutMs - Telegram launch timeout
 * @property {number} timeouts.fetchTimeoutMs - API fetch timeout
 * @property {number} timeouts.retryDelayMs - Retry delay for failed requests
 * @property {number} timeouts.shutdownGraceMs - Graceful shutdown delay
 * @property {number} timeouts.gatekeeperIntervalMs - Gatekeeper check interval
 * @property {Object} api - API specific configurations
 * @property {string} api.tradingViewUrl - TradingView scanner URL
 * @property {string} api.userAgent - Browser user agent
 * @property {string|null} api.tvCookie - Optional TradingView session cookie
 * @property {Object} screenshot - Screenshot service configurations
 * @property {Object} screenshot.viewport - Viewport dimensions
 * @property {Array<string>} screenshot.blockedResources - List of resource types to block
 * @property {Object} screenshot.cookies - Initial cookies for TradingView
 * @property {Array<string>} screenshot.browserArgs - Chromium launch arguments
 */

/**
 * Parses chat ID from string to appropriate type
 * @param {string} rawChatId - Raw chat ID from environment
 * @returns {string|number} Parsed chat ID
 */
const parseChatId = (rawChatId) =>
    /^\-?\d+$/.test(rawChatId) ? Number(rawChatId) : rawChatId;

/**
 * Parses configuration from environment variables
 * @returns {Config} Configuration object
 */
export const parseConfig = () => Object.freeze({
    botToken: process.env.BOT_TOKEN?.trim(),
    chatId: parseChatId(process.env.CHAT_ID?.trim()),
    threadId: process.env.THREAD_ID ? Number(process.env.THREAD_ID) : null,
    premarketThreshold: Number(process.env.PREMARKET_THRESHOLD || 10),
    scanIntervalMs: Number(process.env.SCAN_INTERVAL_MS || 10000),
    sendOnStartup: String(process.env.SEND_ON_STARTUP || "false") === "true",
    rvolThreshold: Number(process.env.RVOL_THRESHOLD || 2),
    rvolIntervalMs: Number(process.env.RVOL_INTERVAL_MS || 10000),
    rvolAlertStep: Number(process.env.RVOL_ALERT_STEP || 1.0),
    premarketAlertStep: Number(process.env.PREMARKET_ALERT_STEP || 1.0),

    // Trading hours configuration
    premarketHours: Object.freeze({
        start: "04:00",
        end: "09:30"
    }),

    // Timeout configurations (extracted magic numbers)
    timeouts: Object.freeze({
        launchTimeoutMs: 15000,       // Telegram launch timeout (increased from 5000)
        fetchTimeoutMs: 30000,        // API fetch timeout
        retryDelayMs: 2000,           // Base retry delay
        shutdownGraceMs: 1000,        // Graceful shutdown delay
        gatekeeperIntervalMs: 30000   // Gatekeeper check interval
    }),

    // Retry configurations
    retry: Object.freeze({
        maxAttempts: 3,               // Maximum retry attempts
        backoffMultiplier: 1.5        // Exponential backoff multiplier
    }),

    // API configurations
    api: Object.freeze({
        tradingViewUrl: "https://scanner.tradingview.com/america/scan",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        tvCookie: process.env.TV_COOKIE || null
    }),

    // Screenshot configuration (extracted from screenshot.js)
    screenshot: Object.freeze({
        viewport: Object.freeze({ width: 800, height: 600 }),
        blockedResources: Object.freeze(['image', 'font', 'media']),
        browserArgs: Object.freeze([
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--no-first-run',
            '--memory-pressure-off'
        ]),
        intervals: ["D", "240", "15", "1"]
    })
});

/**
 * Validates configuration object
 * @param {Config} config - Configuration to validate
 * @returns {Config} Validated configuration
 * @throws {Error} If configuration is invalid
 */
export const validateConfig = (config) => {
    if (!config.botToken || !config.chatId) {
        throw new Error("❌ Missing BOT_TOKEN or CHAT_ID in .env");
    }
    return config;
};
