/**
 * @fileoverview Central service orchestrator for managing time-based execution
 */
import { isPremarketTime, isMarketNow } from "./utils/index.js";
import { createLogger } from "./logger.js";
import { createStateManager } from "./utils/state.js";

const DEFAULT_TIME_UTILS = { isPremarketTime, isMarketNow };

/**
 * Creates a service orchestrator
 * @param {Object} config - Configuration object
 * @param {Object} services - Map of services to manage
 * @param {Object} [timeUtils=DEFAULT_TIME_UTILS] - Optional time utilities for testing
 * @returns {Object} Orchestrator instance
 */
export const createOrchestrator = (config, services, timeUtils = DEFAULT_TIME_UTILS) => {
    const logger = createLogger();
    const stateManager = createStateManager({
        orchestratorTimer: null
    });

    /**
     * Main check logic that runs every interval
     */
    const checkAndToggleServices = async () => {
        try {
            const inPremarket = timeUtils.isPremarketTime(config.premarketHours);
            const inMarket = timeUtils.isMarketNow();

            const { growthScanner, rvolScanner } = services;

            // 1. Manage Premarket Growth Scanner
            if (inPremarket) {
                if (!growthScanner.getState().isRunning) {
                    logger.info('Orchestrator', '🌅 Premarket started. Starting Growth Scanner...');
                    await growthScanner.start();
                }
            } else {
                if (growthScanner.getState().isRunning) {
                    logger.info('Orchestrator', '🌅 Premarket ended. Stopping Growth Scanner...');
                    growthScanner.stop();
                }
            }

            // 2. Manage Regular Market RVOL Scanner
            if (inMarket) {
                if (!rvolScanner.getState().isRunning) {
                    logger.info('Orchestrator', '🔔 Market opened. Starting RVOL Scanner...');
                    await rvolScanner.start();
                }
            } else {
                if (rvolScanner.getState().isRunning) {
                    logger.info('Orchestrator', '🔔 Market closed. Stopping RVOL Scanner...');
                    rvolScanner.stop();
                }
            }
        } catch (error) {
            logger.error('Orchestrator', `Error in check cycle: ${error.message}`);
        }
    };

    /**
     * Starts the orchestrator gatekeeper
     */
    const start = () => {
        logger.info('Orchestrator', '🚀 Orchestrator active');
        checkAndToggleServices(); // Initial check

        const interval = config.timeouts?.gatekeeperIntervalMs || 30000;
        const orchestratorTimer = setInterval(checkAndToggleServices, interval);
        stateManager.update(() => ({ orchestratorTimer }));
    };

    /**
     * Stops the orchestrator and all managed services gracefully
     */
    const stop = async () => {
        const { orchestratorTimer } = stateManager.get();
        if (orchestratorTimer) clearInterval(orchestratorTimer);

        // Stop all services concurrently and wait for their termination
        await Promise.all(
            Object.values(services).map(async (service) => {
                if (service.stop) {
                    try {
                        await service.stop();
                    } catch (e) {
                        logger.error('Orchestrator', `Failed to stop service: ${e.message}`);
                    }
                }
            })
        );

        logger.info('Orchestrator', '🛑 Orchestrator stopped');
    };

    return Object.freeze({
        start,
        stop
    });
};
