/**
 * @fileoverview Scanner management and premarket monitoring logic
 */
import { processStockData } from "./stockService.js";
import { createStateManager, getCurrentNYTime, isPremarketTime, createStatusMessage } from "./utils.js";
import { createLogger } from "./logger.js";
import { createErrorHandler } from "./errorHandler.js";

/**
 * Creates scanner service with enhanced logging and error handling
 * @param {Object} config - Configuration object
 * @param {Object} telegramService - Telegram service instance
 * @returns {Object} Scanner service instance
 */
export const createScanner = (config, telegramService) => {
  const logger = createLogger();
  const errorHandler = createErrorHandler(logger);
  
  const stateManager = createStateManager({
    isRunning: false,
    isFirstScan: true,
    seenSymbols: new Set(),
    sendOnStartup: config.sendOnStartup,
    scanTimer: null,
    gateTimer: null
  });

  /**
   * Performs a single scan operation
   * @returns {Promise<void>}
   */
  const scanOnce = async () => {
    const currentState = stateManager.get();
    try {
      const newState = await processStockData(
        config.premarketThreshold, 
        currentState, 
        telegramService,
        config
      );
      stateManager.update(() => newState);
    } catch (error) {
      errorHandler.handle(error, {
        component: 'ScannerService',
        operation: 'scanOnce',
        metadata: { threshold: config.premarketThreshold }
      });
    }
  };

  /**
   * Starts the scanner with status notification
   * @returns {Promise<void>}
   */
  const startScanner = async () => {
    const state = stateManager.get();
    if (state.isRunning) return;

    try {
      await telegramService.sendMessage(createStatusMessage(true));
      logger.scanner.start();
      
      stateManager.update(() => ({
        isRunning: true,
        isFirstScan: true,
        seenSymbols: new Set()
      }));

      await scanOnce();
      const scanTimer = setInterval(scanOnce, config.scanIntervalMs);
      stateManager.update(() => ({ scanTimer }));
    } catch (error) {
      errorHandler.handle(error, {
        component: 'ScannerService',
        operation: 'startScanner'
      });
    }
  };

  /**
   * Stops the scanner with status notification
   * @returns {Promise<void>}
   */
  const stopScanner = async () => {
    const state = stateManager.get();
    if (!state.isRunning) return;

    try {
      if (state.scanTimer) {
        clearInterval(state.scanTimer);
      }

      stateManager.update(() => ({
        isRunning: false,
        scanTimer: null
      }));

      logger.scanner.stop();
      await telegramService.sendMessage(createStatusMessage(false));
    } catch (error) {
      errorHandler.handle(error, {
        component: 'ScannerService',
        operation: 'stopScanner'
      });
    }
  };

  /**
   * Checks premarket status and manages scanner state
   * @returns {Promise<void>}
   */
  const checkPremarket = async () => {
    try {
      const { hhmm, weekday } = getCurrentNYTime();
      const inPremarket = isPremarketTime(config.premarketHours);
      const state = stateManager.get();
      
      logger.scanner.premarket(weekday, hhmm, inPremarket);
      
      if (inPremarket && !state.isRunning) {
        await startScanner();
      } else if (!inPremarket && state.isRunning) {
        await stopScanner();
      }
    } catch (error) {
      errorHandler.handle(error, {
        component: 'ScannerService',
        operation: 'checkPremarket'
      });
    }
  };

  /**
   * Starts the premarket gatekeeper with configurable interval
   * @returns {void}
   */
  const startGatekeeper = () => {
    try {
      checkPremarket(); // Initial check
      const gatekeeperInterval = config.timeouts?.gatekeeperIntervalMs || 30000;
      const gateTimer = setInterval(checkPremarket, gatekeeperInterval);
      stateManager.update(() => ({ gateTimer }));
      
      logger.info('ScannerService', `Gatekeeper started with ${gatekeeperInterval}ms interval`);
    } catch (error) {
      errorHandler.handle(error, {
        component: 'ScannerService',
        operation: 'startGatekeeper'
      });
    }
  };

  /**
   * Gracefully shuts down the scanner service
   * @returns {Promise<void>}
   */
  const shutdown = async () => {
    try {
      logger.info('ScannerService', 'Initiating graceful shutdown...');
      
      const state = stateManager.get();
      
      if (state.gateTimer) clearInterval(state.gateTimer);
      if (state.scanTimer) clearInterval(state.scanTimer);
      
      await stopScanner().catch(error => {
        logger.warn('ScannerService', `Error during scanner stop: ${error.message}`);
      });
      
      // Give some time for final operations
      await new Promise(resolve => 
        setTimeout(resolve, config.timeouts?.shutdownGraceMs || 1000)
      );
      
      telegramService.stop("SHUTDOWN");
      stateManager.reset();
      
      logger.info('ScannerService', 'Shutdown completed');
    } catch (error) {
      errorHandler.handle(error, {
        component: 'ScannerService',
        operation: 'shutdown'
      });
    }
  };

  return Object.freeze({
    startGatekeeper: errorHandler.wrap(startGatekeeper, {
      component: 'ScannerService',
      operation: 'startGatekeeper'
    }),
    shutdown: errorHandler.wrapAsync(shutdown, {
      component: 'ScannerService',
      operation: 'shutdown'
    }),
    getState: stateManager.get
  });
};
