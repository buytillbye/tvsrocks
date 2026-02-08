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
        lastReportedRvol: new Map(), // ticker -> last reported value
        scanTimer: null
    });

    /**
     * Performs a single RVOL scan
     */
    const scanOnce = async () => {
        const state = stateManager.get();
        try {
            const rawStocks = await TvScanner.getRvolSurgeStocks(config, config.rvolThreshold);

            if (!rawStocks || rawStocks.length === 0) return;

            const candidates = rawStocks.map(TvScanner.mapRvolRow);
            const alertsToSend = [];

            for (const stock of candidates) {
                const prevValue = state.lastReportedRvol.get(stock.symbol);

                // Alert conditions:
                // 1. Never seen before
                // 2. Current RVOL is higher than last reported + step
                const shouldAlert = !prevValue || (stock.rvol_intraday_5m >= prevValue + config.rvolAlertStep);

                if (shouldAlert) {
                    alertsToSend.push({ stock, prevValue });
                }
            }

            if (alertsToSend.length === 0) return;

            // Update state with new RVOL values
            const updatedMap = new Map(state.lastReportedRvol);
            alertsToSend.forEach(({ stock }) => updatedMap.set(stock.symbol, stock.rvol_intraday_5m));
            stateManager.update(() => ({ lastReportedRvol: updatedMap }));

            // Send alerts
            for (const { stock, prevValue } of alertsToSend) {
                const isUpdate = !!prevValue;
                const prefix = isUpdate ? "📈 *RVOL GROWTH*" : "🚀 *RVOL SURGE ALERT*";

                const message = `${prefix}\n\n` +
                    `Ticker: \`${stock.symbol}\`\n` +
                    `RVOL 5m: *${stock.rvol_intraday_5m.toFixed(2)}x*` +
                    (isUpdate ? ` (was ${prevValue.toFixed(2)}x)` : "") + "\n" +
                    `Price: *$${stock.close.toFixed(2)}*\n` +
                    `Change: *${stock.change.toFixed(2)}%*\n` +
                    `Volume: *${(stock.volume / 1000000).toFixed(2)}M*\n` +
                    `Premarket: *${stock.premarket_change.toFixed(2)}%*`;

                logger.info('RvolService', `${isUpdate ? 'Growth' : 'Surge'} detected: ${stock.symbol} (${stock.rvol_intraday_5m.toFixed(2)})`);
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
