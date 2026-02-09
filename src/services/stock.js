/**
 * @fileoverview Stock data processing and filtering logic
 */
import { TvScanner } from "./tradingview.js";
import { createStockMessage } from "../core/utils/index.js";
import { createLogger } from "../core/logger.js";
import { createErrorHandler, TradingViewError } from "../core/errorHandler.js";
import { validateStockData, validateTradingViewResponse } from "../config/validation.js";

/**
 * @typedef {Object} StockState
 * @property {Map<string, number>} lastReportedChanges - Map of ticker symbols to last reported premarket change
 * @property {boolean} isFirstScan - Whether this is the first scan
 * @property {boolean} sendOnStartup - Whether to send notifications on startup
 */

/**
 * Validates if stock has acceptable float shares outstanding
 * @param {Object} stock - Stock data object
 * @returns {boolean} True if float is valid (not null and > 75M)
 */
export const isValidFloat = (stock) => {
    const float = stock.float_shares_outstanding;
    return float == null || float <= 15000000; // 15M або його чомусь нема
};

/**
 * Filters out stocks that have already been seen
 * @param {Array} stocks - Raw stock data from API
 * @param {Set} seenSymbols - Set of previously seen symbols
 * @returns {Array} New stocks not in seen set
 */
export const filterNewStocks = (stocks, seenSymbols) =>
    stocks
        .map(TvScanner.mapRow)
        .filter(stock => {
            // Validate each stock before processing
            const validation = validateStockData(stock);
            if (!validation.isValid) {
                console.warn(`Invalid stock data: ${validation.errors.join(', ')}`, stock);
                return false;
            }

            // Check if float is valid (is null or <= 75M)
            if (!isValidFloat(stock)) {
                console.log(`Filtered out ${stock.symbol}: float ${stock.float_shares_outstanding} is null or <= 15M`);
                return false;
            }

            return !seenSymbols.has(stock.symbol);
        });

/**
 * Extracts symbols from raw stock data
 * @param {Array} rawStocks - Raw stock data
 * @returns {Set} Set of stock symbols
 */
export const extractSymbols = (rawStocks) =>
    new Set(rawStocks.map(stock => stock.s));

/**
 * Determines whether to send notifications based on scan state
 * @param {boolean} isFirstScan - Whether this is first scan
 * @param {boolean} sendOnStartup - Whether to send on startup
 * @param {number} newStocksCount - Number of candidate stocks to alert
 * @returns {boolean} Whether to send notifications
 */
export const shouldSendNotifications = (isFirstScan, sendOnStartup, newStocksCount) =>
    newStocksCount > 0 && (sendOnStartup || !isFirstScan);

/**
 * Processes stock data with enhanced logging and error handling
 * @param {number} threshold - Premarket change threshold
 * @param {StockState} state - Current scanner state
 * @param {Object} telegramService - Telegram service instance
 * @param {Object} config - Configuration object
 * @returns {Promise<StockState>} Updated state
 */
export const processStockData = async (threshold, state, telegramService, config) => {
    const logger = createLogger();
    const errorHandler = createErrorHandler(logger);

    try {
        logger.tradingview.request(1, config.retry.maxAttempts);
        const rawStocks = await TvScanner.getStocks10(config, threshold);

        // Validate API response
        const validation = validateTradingViewResponse({ data: rawStocks, totalCount: rawStocks.length });
        if (!validation.isValid) {
            throw new TradingViewError(`Invalid API response: ${validation.errors.join(', ')}`);
        }

        logger.tradingview.success(0, rawStocks.length, rawStocks.length);

        if (rawStocks.length === 0) {
            logger.scanner.noData();
            return state;
        }

        const candidates = rawStocks.map(TvScanner.mapRow);
        const alertsToSend = [];

        for (const stock of candidates) {
            // Validate each stock before processing
            const validation = validateStockData(stock);
            if (!validation.isValid) {
                console.warn(`Invalid stock data: ${validation.errors.join(', ')}`, stock);
                continue;
            }

            // Check if float is valid
            if (!isValidFloat(stock)) {
                console.log(`Filtered out ${stock.symbol}: float ${stock.float_shares_outstanding} is null or <= 15M`);
                continue;
            }

            const prevChange = state.lastReportedChanges.get(stock.symbol);

            // Alert conditions:
            // 1. Never seen before
            // 2. Current change is higher than last reported + step
            const shouldAlert = prevChange === undefined || (stock.premarket_change >= prevChange + config.premarketAlertStep);

            if (shouldAlert) {
                alertsToSend.push({ stock, prevChange });
            }
        }

        const updatedChanges = new Map(state.lastReportedChanges);
        // Only update reported changes for stocks that were candidates in THIS scan (all rawStocks)
        // Actually, we should only update if we are SENDING notifications or if it's the first scan boostrap
        // Following the existing logic's pattern:

        if (alertsToSend.length === 0) {
            logger.scanner.noNewStocks();
            return {
                ...state,
                isFirstScan: false
            };
        }

        if (!shouldSendNotifications(state.isFirstScan, state.sendOnStartup, alertsToSend.length)) {
            logger.scanner.bootstrapSuppressed(alertsToSend.length);
            // Record initial values to suppress future alerts until they grow
            alertsToSend.forEach(({ stock }) => updatedChanges.set(stock.symbol, stock.premarket_change));
            return {
                ...state,
                lastReportedChanges: updatedChanges,
                isFirstScan: false
            };
        }

        // Send notifications for new stocks with error handling
        const sendPromises = alertsToSend.map(async ({ stock, prevChange }) => {
            try {
                const isUpdate = prevChange !== undefined;
                const message = createStockMessage(stock, isUpdate, prevChange);
                logger.scanner.newStock(stock.symbol, stock.premarket_change.toFixed(2));

                const result = await telegramService.sendMessage(message);
                if (result.success) {
                    updatedChanges.set(stock.symbol, stock.premarket_change);
                } else {
                    logger.error('StockService', `Failed to send notification for ${stock.symbol}`, {
                        error: result.error?.message
                    });
                }
                return result;
            } catch (error) {
                errorHandler.handle(error, {
                    component: 'StockService',
                    operation: 'sendNotification',
                    metadata: { symbol: stock.symbol, change: stock.premarket_change }
                });
                return { success: false, error };
            }
        });

        await Promise.allSettled(sendPromises);

        return {
            ...state,
            lastReportedChanges: updatedChanges,
            isFirstScan: false
        };
    } catch (error) {
        if (error instanceof TradingViewError) {
            logger.tradingview.error(error.message);
        } else {
            errorHandler.handle(error, {
                component: 'StockService',
                operation: 'processStockData',
                metadata: { threshold, stateKeys: Object.keys(state) }
            });
        }

        return { ...state, isFirstScan: false };
    }
};
