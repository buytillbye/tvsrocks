/**
 * @fileoverview RVOL surge monitoring service
 * 
 * [DISABLED] Market Scanner — entire service commented out, will be rewritten.
 * Stub export kept so existing imports don't break.
 */

// TODO: Market scanner disabled — will be rewritten
export const createRvolService = () => Object.freeze({
    start: async () => { },
    stop: () => { },
    getState: () => ({ isRunning: false, lastTotalCount: 0, lastTickers: [], alertCount: 0 })
});

// =============================================================================
// [DISABLED] Original RVOL Service implementation below
// =============================================================================
//
// import { TvScanner } from "./tradingview.js";
// import { captureTicker, captureStitchedTicker } from "./screenshot.js";
// import { createStateManager, createStatusMessage } from "../core/utils/index.js";
// import { createLogger } from "../core/logger.js";
// import { createErrorHandler } from "../core/errorHandler.js";
//
// export const createRvolService = (config, telegramService, scanner = TvScanner) => {
//     const logger = createLogger();
//     const errorHandler = createErrorHandler(logger);
//
//     const stateManager = createStateManager({
//         isRunning: false,
//         isStarting: false,
//         lastReportedRvol: new Map(),
//         lastTotalCount: 0,
//         lastTickers: [],
//         alertCount: 0,
//         scanTimer: null
//     });
//
//     const scanOnce = async () => {
//         const state = stateManager.get();
//         try {
//             const { data: rawStocks, totalCount } = await scanner.getRvolSurgeStocks(config, config.rvolThreshold);
//
//             const currentTickers = rawStocks?.map(s => s.s) || [];
//
//             if (!rawStocks || rawStocks.length === 0) {
//                 stateManager.update(() => ({
//                     lastTotalCount: totalCount,
//                     lastTickers: currentTickers
//                 }));
//                 return;
//             }
//
//             const candidates = rawStocks.map(TvScanner.mapRvolRow);
//             const alertsToSend = [];
//
//             for (const stock of candidates) {
//                 const prevValue = state.lastReportedRvol.get(stock.symbol);
//                 const shouldAlert = !prevValue || (stock.rvol_intraday_5m >= prevValue + config.rvolAlertStep);
//
//                 if (shouldAlert) {
//                     alertsToSend.push({ stock, prevValue });
//                 }
//             }
//
//             const updatedMap = new Map(stateManager.get().lastReportedRvol);
//             alertsToSend.forEach(({ stock }) => updatedMap.set(stock.symbol, stock.rvol_intraday_5m));
//
//             stateManager.update(s => ({
//                 lastReportedRvol: updatedMap,
//                 lastTotalCount: totalCount,
//                 lastTickers: currentTickers,
//                 alertCount: s.alertCount + alertsToSend.length
//             }));
//
//             if (alertsToSend.length === 0) return;
//
//             for (const { stock, prevValue } of alertsToSend) {
//                 const isUpdate = !!prevValue;
//                 const prefix = isUpdate ? "📈 *RVOL GROWTH*" : "🚀 *RVOL SURGE ALERT*";
//
//                 const message = `${prefix}\n\n` +
//                     `Ticker: \`${stock.symbol}\`\n` +
//                     `RVOL 5m: *${stock.rvol_intraday_5m.toFixed(2)}x*` +
//                     (isUpdate ? ` (was ${prevValue.toFixed(2)}x)` : "") + "\n" +
//                     `Price: *$${stock.close.toFixed(2)}*\n` +
//                     `Change: *${stock.change.toFixed(2)}%*\n` +
//                     `Float: *${(stock.float_shares_outstanding / 1000000).toFixed(2)}M*\n` +
//                     `Volume: *${(stock.volume / 1000000).toFixed(2)}M*\n` +
//                     `Premarket: *${stock.premarket_change.toFixed(2)}%*`;
//
//                 logger.info('RvolService', `${isUpdate ? 'Growth' : 'Surge'} detected: ${stock.symbol} (${stock.rvol_intraday_5m.toFixed(2)})`);
//
//                 const intervals = config.screenshot.intervals || ["D", "240", "15", "1"];
//                 const chartPath = await captureStitchedTicker(stock.symbol, config, intervals);
//
//                 if (chartPath) {
//                     await telegramService.sendPhoto(chartPath, message);
//                 } else {
//                     await telegramService.sendMessage(message);
//                 }
//             }
//         } catch (error) {
//             errorHandler.handle(error, {
//                 component: 'RvolService',
//                 operation: 'scanOnce'
//             });
//         }
//     };
//
//     const start = async () => {
//         const state = stateManager.get();
//         if (state.isRunning || state.isStarting) return;
//
//         try {
//             stateManager.update(() => ({ isStarting: true }));
//             logger.info('RvolService', "🚀 RVOL Listener started");
//
//             await scanOnce();
//
//             const scanTimer = setInterval(scanOnce, config.rvolIntervalMs);
//             stateManager.update(() => ({
//                 isRunning: true,
//                 isStarting: false,
//                 lastReportedRvol: new Map(),
//                 lastTickers: [],
//                 alertCount: 0,
//                 scanTimer
//             }));
//         } catch (error) {
//             stateManager.update(() => ({ isStarting: false }));
//             errorHandler.handle(error, {
//                 component: 'RvolService',
//                 operation: 'start'
//             });
//         }
//     };
//
//     const stop = () => {
//         const state = stateManager.get();
//         if (state.scanTimer) clearInterval(state.scanTimer);
//         stateManager.update(() => ({ isRunning: false, scanTimer: null }));
//         logger.info('RvolService', "🛑 RVOL Listener stopped");
//     };
//
//     return Object.freeze({
//         start,
//         stop,
//         getState: stateManager.get
//     });
// };
