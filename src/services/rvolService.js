/**
 * @fileoverview RVOL surge monitoring service
 */
import { TvScanner } from "./tradingview.js";
import { createStateManager, createStatusMessage } from "../core/utils/index.js";
import { createLogger } from "../core/logger.js";
import { createErrorHandler } from "../core/errorHandler.js";

/**
 * Creates RVOL service
 * @param {Object} config - Configuration object
 * @param {Object} telegramService - Telegram service instance
 * @returns {Object} RVOL service instance
 */
export const createRvolService = (config, telegramService) => {
    const logger = createLogger();
    const errorHandler = createErrorHandler(logger);

    const stateManager = createStateManager({
        isRunning: false,
        seenSymbols: new Set(),
        scanTimer: null
    });

    /**
     * Performs a single RVOL scan
     */
    const scanOnce = async () => {
        const state = stateManager.get();
        try {
            const rawStocks = await TvScanner.getRvolSurgeStocks(config.rvolThreshold);

            if (!rawStocks || rawStocks.length === 0) return;

            const newStocks = rawStocks
                .map(TvScanner.mapRvolRow)
                .filter(stock => !state.seenSymbols.has(stock.symbol));

            if (newStocks.length === 0) return;

            // Update seen symbols
            const updatedSymbols = new Set([...state.seenSymbols]);
            newStocks.forEach(s => updatedSymbols.add(s.symbol));
            stateManager.update(() => ({ seenSymbols: updatedSymbols }));

            // Send alerts
            for (const stock of newStocks) {
                const message = `🚀 *RVOL SURGE ALERT*\n\n` +
                    `Ticker: \`${stock.symbol}\`\n` +
                    `RVOL 5m: *${stock.rvol_intraday_5m.toFixed(2)}x*\n` +
                    `Price: *$${stock.close.toFixed(2)}*\n` +
                    `Change: *${stock.change.toFixed(2)}%*\n` +
                    `Volume: *${(stock.volume / 1000000).toFixed(2)}M*\n` +
                    `Premarket: *${stock.premarket_change.toFixed(2)}%*`;

                logger.info('RvolService', `Surge detected: ${stock.symbol} (RVOL: ${stock.rvol_intraday_5m})`);
                await telegramService.sendMessage(message);
            }
        } catch (error) {
            errorHandler.handle(error, {
                component: 'RvolService',
                operation: 'scanOnce'
            });
        }
    };

    const start = async () => {
        const state = stateManager.get();
        if (state.isRunning) return;

        logger.info('RvolService', "🚀 RVOL Listener started");
        stateManager.update(() => ({ isRunning: true }));

        await scanOnce();
        const scanTimer = setInterval(scanOnce, config.rvolIntervalMs);
        stateManager.update(() => ({ scanTimer }));
    };

    const stop = () => {
        const state = stateManager.get();
        if (state.scanTimer) clearInterval(state.scanTimer);
        stateManager.update(() => ({ isRunning: false, scanTimer: null }));
        logger.info('RvolService', "🛑 RVOL Listener stopped");
    };

    return Object.freeze({
        start,
        stop
    });
};
