/**
 * @fileoverview Formatting utilities for financial data and tokens
 */

/**
 * @typedef {Object} StockData
 * @property {string} symbol - Stock symbol (e.g., "NASDAQ:AAPL")
 * @property {number} premarket_change - Percentage change in premarket
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
 * @returns {string} Formatted message for Telegram
 */
export const createStockMessage = (stock) => [
  `📈 ${stock.symbol}`,
  `• Price: ${stock.premarket_close}%`,
  `• Change: ${stock.premarket_change.toFixed(2)}%`,
  `• Float: ${formatNum(stock.float_shares_outstanding)}`,
  `• Vol: ${formatNum(stock.premarket_volume)}`,
  `• $Dol-Vol$: ${formatNum(stock.premarket_volume * stock.premarket_close)}`,
].join('\n');

/**
 * Creates status message for scanner start/stop
 * @param {boolean} isStarting - True if starting, false if stopping
 * @returns {string} Formatted status message
 */
export const createStatusMessage = (isStarting) => 
  isStarting 
    ? "🟢 Stocks10 premarket watcher started (ET 04:00–09:30)"
    : "🔴 Stocks10 premarket watcher stopped (outside ET 04:00–09:30)";
