import { createLogger } from "../core/logger.js";
import { TvScanner as DefaultScanner } from "./tradingview.js";

/**
 * Catalyst Sniper Service (Gap & Reverse Scanner)
 */
export const createCatalystService = (config, telegram, scanner = DefaultScanner) => {
    const logger = createLogger();
    const state = {
        isRunning: false,
        isWatchlistOnly: true, // 08:00 - 09:30 mode
        watchlist: new Map(),  // symbol -> { gap, preVol, score }
        triggered: new Set(),  // symbols that already alerted today
        timer: null
    };

    /**
     * Calc score for ranking
     */
    const calcScore = (gap, preVol) => Math.abs(gap) * Math.log10(preVol || 1);

    /**
     * Format alert message
     */
    const formatAlert = (stock, strategy) => {
        const isFader = strategy === 'FADE';
        const icon = isFader ? '📉' : '🚀';
        const statusEmoji = isFader ? '🔴' : '🟢';
        const actionText = isFader ? 'Watch for breakdown.' : 'Watch for recovery.';

        return `🎯 CATALYST SNIPER ALERT
---------------------------
Strategy: ${icon} ${strategy}
Ticker:   $${stock.symbol.split(':')[1] || stock.symbol}
Gap:      ${stock.gap > 0 ? '+' : ''}${stock.gap.toFixed(1)}%
Pre-Vol:  ${(stock.preVol / 1000000).toFixed(1)}M
Status:   ${statusEmoji} ${isFader ? 'Breaking Below Open' : 'Breaking Above Open'} (${stock.currentChange > 0 ? '+' : ''}${stock.currentChange.toFixed(1)}%)
---------------------------
Action: ${actionText}`;
    };

    /**
     * Core scan logic
     */
    const performScan = async () => {
        logger.info('Catalyst', '--- performScan initiation ---');
        try {
            if (state.isWatchlistOnly) {
                // Phase 1: Build Watchlist (08:00 - 09:30)
                logger.info('Catalyst', 'Fetching candidates for watchlist...');
                const { data } = await scanner.getCatalystSetupStocks(config);
                const results = data.map(scanner.mapRow);

                results.forEach(s => {
                    if (state.watchlist.has(s.symbol)) return;

                    const score = calcScore(s.premarket_change, s.premarket_volume);
                    state.watchlist.set(s.symbol, {
                        symbol: s.symbol,
                        gap: s.premarket_change,
                        preVol: s.premarket_volume,
                        score
                    });
                    logger.info('Catalyst', `[+ WATCHLIST] ${s.symbol.split(':')[1] || s.symbol} | Gap: ${s.premarket_change.toFixed(1).padStart(5)}% | Vol: ${(s.premarket_volume / 1000).toFixed(0).padStart(4)}k | Score: ${score.toFixed(1)}`);
                });

                logger.info('Catalyst', `Watchlist updated: ${state.watchlist.size} candidates total`);
            } else {
                // Phase 2: Active Monitoring (09:30 - 13:30)
                if (state.watchlist.size === 0) {
                    logger.info('Catalyst', 'Empty watchlist, skipping scan.');
                    return;
                }

                const { data } = await scanner.getMarketStocks(config);
                const marketData = data.map(scanner.mapMarketRow);

                logger.info('Catalyst', `Active Scan: Checking ${marketData.length} stocks against watchlist...`);
                for (const s of marketData) {
                    if (state.triggered.has(s.symbol)) continue;

                    const candidate = state.watchlist.get(s.symbol);
                    if (!candidate) continue;

                    const ticker = s.symbol.split(':')[1] || s.symbol;
                    const openDiff = s.change_from_open;

                    // Detailed log for comparison
                    logger.info('Catalyst', `[CHECK] ${ticker.padEnd(6)} | Gap: ${candidate.gap.toFixed(1).padStart(5)}% | OpenDiff: ${openDiff.toFixed(2).padStart(6)}%`);

                    // Strategy A: Fader (Gap Up > 4%, ChangeFromOpen < -0.5%)
                    if (candidate.gap > 4.0 && openDiff < -0.5) {
                        logger.info('Catalyst', `🎯 TRIGGER: ${ticker} matched FADE pattern! (Gap ${candidate.gap.toFixed(1)}% & Drop ${openDiff.toFixed(2)}%)`);
                        const msg = formatAlert({ ...candidate, currentChange: openDiff }, 'FADE (Short)');
                        await telegram.sendMessage(msg);
                        state.triggered.add(s.symbol);
                    }

                    // Strategy B: Bounce (Gap Down < -8%, ChangeFromOpen > 0.5%)
                    else if (candidate.gap < -8.0 && openDiff > 0.5) {
                        logger.info('Catalyst', `🎯 TRIGGER: ${ticker} matched BOUNCE pattern! (Gap ${candidate.gap.toFixed(1)}% & Recovery ${openDiff.toFixed(2)}%)`);
                        const msg = formatAlert({ ...candidate, currentChange: openDiff }, 'BOUNCE (Long)');
                        await telegram.sendMessage(msg);
                        state.triggered.add(s.symbol);
                    }
                }
            }
        } catch (error) {
            logger.error('Catalyst', `Scan error: ${error.message} ${error.stack}`);
        }
    };

    const start = (mode = 'watchlist') => {
        if (state.isRunning) return;
        state.isRunning = true;
        state.isWatchlistOnly = (mode === 'watchlist');

        logger.info('Catalyst', `Service started in ${mode} mode`);

        // Initial scan
        performScan();

        const interval = state.isWatchlistOnly
            ? (config.catalystWatchlistIntervalMs || 60000)
            : (config.catalystActiveIntervalMs || 15000);

        logger.info('Catalyst', `Starting interval: ${interval}ms`);
        state.timer = setInterval(performScan, interval);
    };

    const stop = () => {
        if (state.timer) clearInterval(state.timer);
        state.isRunning = false;
        state.watchlist.clear();
        state.triggered.clear();
        logger.info('Catalyst', 'Service stopped and state cleared');
    };

    const setMode = (mode) => {
        const watchlistOnly = (mode === 'watchlist');
        if (state.isWatchlistOnly !== watchlistOnly) {
            state.isWatchlistOnly = watchlistOnly;
            logger.info('Catalyst', `Mode switched to: ${mode}`);

            // Adjust interval and run immediately
            if (state.isRunning) {
                clearInterval(state.timer);

                // Immediate call
                performScan();

                const interval = state.isWatchlistOnly
                    ? (config.catalystWatchlistIntervalMs || 60000)
                    : (config.catalystActiveIntervalMs || 15000);

                logger.info('Catalyst', `Adjusted interval: ${interval}ms`);
                state.timer = setInterval(performScan, interval);
            }
        }
    };

    return {
        start,
        stop,
        setMode,
        getState: () => ({ ...state })
    };
};
