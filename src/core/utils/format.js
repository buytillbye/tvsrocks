/**
 * @fileoverview Formatting utilities for financial data and tokens
 */

/**
 * @typedef {Object} StockData
 * @property {string} symbol - Stock symbol (e.g., "NASDAQ:AAPL")
 * @property {number} premarket_change - Percentage change in premarket
 * @property {number} premarket_close - Premarket last/close price in dollars
 * @property {number} float_shares_outstanding - Float shares outstanding
 * @property {number} premarket_volume - Premarket trading volume
 */

/**
 * Masks sensitive tokens for logging purposes
 * @param {string|null|undefined} token - Token to mask
 * @returns {string} Masked token showing first 9 and last 5 characters
 */
export const maskToken = (token) =>
    !token ? "(empty)" : `${token.slice(0, 9)}...${token.slice(-5)}`;

/**
 * Formats large numbers with appropriate suffixes (K, M, B)
 * @param {number|null|undefined} n - Number to format
 * @returns {string} Formatted number string with suffix
 */
export const formatNum = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return "-";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return Math.round(n / 1e3) + "K";
    return String(n);
};

/**
 * Creates formatted message for stock notification
 * @param {StockData} stock - Stock data object
 * @param {boolean} isUpdate - Whether this is an update to an existing alert
 * @param {number|null} prevChange - Previous reported change percentage
 * @param {number} count - Current alert count for this stock
 * @returns {string} Formatted message for Telegram
 */
export const createStockMessage = (stock, isUpdate = false, prevChange = null, count = 1) => {
    const price = (stock.premarket_close === null || stock.premarket_close === undefined || Number.isNaN(stock.premarket_close))
        ? "-"
        : `$${Number(stock.premarket_close).toFixed(2)}`;
    const change = (stock.premarket_change === null || stock.premarket_change === undefined || Number.isNaN(stock.premarket_change))
        ? "-"
        : `${Number(stock.premarket_change).toFixed(2)}%`;
    const floatStr = formatNum(stock.float_shares_outstanding);
    const volStr = formatNum(stock.premarket_volume);
    const dollarVolRaw = (Number(stock.premarket_volume) || 0) * (Number(stock.premarket_close) || 0);
    const dollarVolStr = dollarVolRaw > 0 ? `$${formatNum(dollarVolRaw)}` : "-";

    const emoji = isUpdate ? "📈" : "🚀";
    const changeSuffix = isUpdate && prevChange !== null ? ` (was ${prevChange.toFixed(2)}%)` : "";
    const stepPrefix = count > 1 ? `[STEP #${count}] ` : "";

    return [
        `${stepPrefix}${emoji} ${stock.symbol}`,
        `• Price: ${price}`,
        `• Change: ${change}${changeSuffix}`,
        `• Float: ${floatStr}`,
        `• Vol: ${volStr}`,
        `• $Dol-Vol$: ${dollarVolStr}`,
    ].join('\n');
};

/**
 * Creates status message for scanner start/stop
 * @param {boolean} isStarting - True if starting, false if stopping
 * @returns {string} Formatted status message
 */
export const createStatusMessage = (createStatusMessage) =>
    createStatusMessage
        ? "🟢 ScreenStonks premarket watcher started (ET 04:00–09:30)"
        : "🔴 ScreenStonks premarket watcher stopped (outside ET 04:00–09:30)";

/**
 * Creates a startup message with configuration parameters
 * @param {Config} config - Configuration object
 * @returns {string} Formatted startup message
 */
export const createStartupMessage = (config) => {
    const title = `🤖 *ScreenStonks Bot (${config.scanIntervalMs / 1000}s)*`;
    const pre = `🌅 *PRE*: >${config.premarketThreshold}%, >$0.8, >50K, Flt<15M, Step:+${config.premarketAlertStep}%`;
    const mkt = `🔥 *MKT*: Shadow Velocity (${config.marketScanIntervalMs / 1000}s scan, ${config.marketDashboardIntervalMs / 1000}s dash)`;

    return [
        title,
        pre,
        mkt
    ].join('\n');
};
