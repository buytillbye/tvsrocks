/**
 * @fileoverview Central service orchestrator for managing time-based execution
 */
import { isPremarketTime, isMarketNow, isWeekend } from "./utils/index.js";
import { createLogger } from "./logger.js";
import { createStateManager } from "./utils/state.js";

const DEFAULT_TIME_UTILS = {
    isPremarketTime,
    isMarketNow,
    isWeekend,
    getNow: () => new Date()
};

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
        orchestratorTimer: null,
        isProcessing: false
    });

    /**
     * Main check logic that runs every interval
     */
    const checkAndToggleServices = async () => {
        const { isProcessing } = stateManager.get();
        if (isProcessing) return;

        try {
            stateManager.update(() => ({ isProcessing: true }));

            const inPremarket = timeUtils.isPremarketTime(config.premarketHours);
            const inMarket = timeUtils.isMarketNow();
            const now = timeUtils.getNow();
            const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

            logger.info('Orchestrator', `--- Cycle Check [NY ${timeStr}] ---`);
            logger.info('Orchestrator', `Phase: Premarket=${inPremarket ? 'YES' : 'NO'}, Market=${inMarket ? 'OPEN' : 'CLOSED'}`);

            const { growthScanner, marketScanner, catalystScanner } = services;

            // 1. Manage Premarket Growth Scanner
            if (growthScanner && inPremarket) {
                const s = growthScanner.getState();
                logger.info('Orchestrator', `GrowthScanner: ${s.isRunning ? 'RUNNING' : 'STOPPED'} (Alerts: ${s.alertCount})`);
                if (!s.isRunning && !s.isStarting) {
                    logger.info('Orchestrator', '🌅 Premarket started. Starting Growth Scanner...');
                    await growthScanner.start();
                }
            } else if (growthScanner) {
                if (growthScanner.getState().isRunning) {
                    logger.info('Orchestrator', '🌅 Premarket ended. Stopping Growth Scanner...');
                    await growthScanner.stop();
                }
            }

            // 2. Manage Market Scanner (Shadow Velocity)
            if (marketScanner) {
                const s = marketScanner.getState();
                logger.info('Orchestrator', `MarketScanner: ${s.isRunning ? 'RUNNING' : 'STOPPED'} (Alpha: ${s.alphaCount}, Bear: ${s.bearCount})`);
                if (inMarket) {
                    if (!s.isRunning) {
                        logger.info('Orchestrator', '🔥 Market opened. Starting Shadow Velocity Scanner...');
                        await marketScanner.start();
                    }
                } else {
                    if (s.isRunning) {
                        logger.info('Orchestrator', '🔥 Market closed. Stopping Shadow Velocity Scanner...');
                        await marketScanner.stop();
                    }
                }
            }

            // 3. Manage Catalyst Sniper (Gap & Reverse)
            if (catalystScanner) {
                const isOffDay = timeUtils.isWeekend(now);
                const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

                const inCatalystSetup = !isOffDay && currentTimeStr >= "08:00" && currentTimeStr < "09:30";
                const inCatalystActive = !isOffDay && currentTimeStr >= "09:30" && currentTimeStr < "13:30";

                const s = catalystScanner.getState();
                const mode = s.isRunning ? (s.isWatchlistOnly ? 'WATCHLIST' : 'ACTIVE') : 'OFF';
                logger.info('Orchestrator', `CatalystScanner: ${mode} (Watchlist: ${s.watchlistSize})`);

                if (inCatalystSetup) {
                    if (!s.isRunning) {
                        logger.info('Orchestrator', '🎯 Catalyst setup phase (08:00-09:30). Starting Watchlist build...');
                        await catalystScanner.start('watchlist');
                    } else if (!s.isWatchlistOnly) {
                        catalystScanner.setMode('watchlist');
                    }
                } else if (inCatalystActive) {
                    if (!s.isRunning) {
                        logger.info('Orchestrator', '🎯 Catalyst active phase (09:30-13:30). Starting alerts...');
                        await catalystScanner.start('active');
                    } else if (s.isWatchlistOnly) {
                        catalystScanner.setMode('active');
                    }
                } else {
                    if (s.isRunning) {
                        logger.info('Orchestrator', '🎯 Catalyst hours ended. Stopping scanner...');
                        await catalystScanner.stop();
                    }
                }
            }
        } catch (error) {
            logger.error('Orchestrator', `Error in check cycle: ${error.message}`);
        } finally {
            stateManager.update(() => ({ isProcessing: false }));
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

        stateManager.update(() => ({
            orchestratorTimer
        }));
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
