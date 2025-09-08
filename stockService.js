/**
 * @fileoverview Stock data processing and filtering logic
 */
import { TvScanner } from "./tvClient.js";
import { createStockMessage } from "./utils.js";
import { createLogger } from "./logger.js";
import { createErrorHandler, TradingViewError } from "./errorHandler.js";
import { validateStockData, validateTradingViewResponse } from "./validation.js";

/**
 * @typedef {Object} StockState
 * @property {Set} seenSymbols - Set of previously seen stock symbols
 * @property {boolean} isFirstScan - Whether this is the first scan
 * @property {boolean} sendOnStartup - Whether to send notifications on startup
 */

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
 * @param {Array} newStocks - Array of new stocks
 * @returns {boolean} Whether to send notifications
 */
export const shouldSendNotifications = (isFirstScan, sendOnStartup, newStocks) => 
  newStocks.length > 0 && (sendOnStartup || !isFirstScan);

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
    const rawStocks = await TvScanner.getStocks10(threshold);
    
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

    const newStocks = filterNewStocks(rawStocks, state.seenSymbols);
    const updatedSymbols = new Set([...state.seenSymbols, ...extractSymbols(rawStocks)]);

    if (newStocks.length === 0) {
      logger.scanner.noNewStocks();
      return { ...state, seenSymbols: updatedSymbols };
    }

    if (!shouldSendNotifications(state.isFirstScan, state.sendOnStartup, newStocks)) {
      logger.scanner.bootstrapSuppressed(newStocks.length);
      return { 
        ...state, 
        seenSymbols: updatedSymbols, 
        isFirstScan: false 
      };
    }

    // Send notifications for new stocks with error handling
    const sendPromises = newStocks.map(async (stock) => {
      try {
        const message = createStockMessage(stock);
        logger.scanner.newStock(stock.symbol, stock.premarket_change.toFixed(2));
        
        const result = await telegramService.sendMessage(message);
        if (!result.success) {
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
        // Don't throw - continue processing other stocks
        return { success: false, error };
      }
    });

    await Promise.allSettled(sendPromises);

    return { 
      ...state, 
      seenSymbols: updatedSymbols, 
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
