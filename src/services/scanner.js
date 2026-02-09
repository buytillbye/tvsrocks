/**
 * @fileoverview Scanner management and premarket monitoring logic
 */
import { processStockData } from "./stock.js";
import { createStateManager, getCurrentNYTime, isPremarketTime, createStatusMessage } from "../core/utils/index.js";
import { createLogger } from "../core/logger.js";
import { createErrorHandler } from "../core/errorHandler.js";

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
        lastReportedChanges: new Map(),
        sendOnStartup: config.sendOnStartup,
        scanTimer: null
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

    const start = async () => {
        const state = stateManager.get();
        if (state.isRunning) return;

        try {
            await telegramService.sendMessage(createStatusMessage(true));
            logger.scanner.start();

            stateManager.update(() => ({
                isRunning: true,
                isFirstScan: true,
                lastReportedChanges: new Map()
            }));

            await scanOnce();
            const scanTimer = setInterval(scanOnce, config.scanIntervalMs);
            stateManager.update(() => ({ scanTimer }));
        } catch (error) {
            errorHandler.handle(error, {
                component: 'ScannerService',
                operation: 'start'
            });
        }
    };

    const stop = async () => {
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
                operation: 'stop'
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

            if (state.scanTimer) clearInterval(state.scanTimer);

            await stop().catch(error => {
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
        start: errorHandler.wrapAsync(start, {
            component: 'ScannerService',
            operation: 'start'
        }),
        stop: errorHandler.wrapAsync(stop, {
            component: 'ScannerService',
            operation: 'stop'
        }),
        shutdown: errorHandler.wrapAsync(shutdown, {
            component: 'ScannerService',
            operation: 'shutdown'
        }),
        getState: stateManager.get
    });
};
