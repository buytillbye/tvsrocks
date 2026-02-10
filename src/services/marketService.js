/**
 * @fileoverview Shadow Velocity Scanner — Market hours scanner service
 * 
 * Two modes:
 *   1. Pinned Dashboard — one message, updated every 30s via editMessage
 *   2. Smart Alerts — separate messages for NEW / PUMP / DUMP triggers
 * 
 * Scoring:
 *   SVS (Shadow Velocity Score) = change_from_open * rvol_5m * log10(value_traded)
 *   HSS (Heavy Short Score)     = |change_from_open| * log10(value_traded)²
 */
import { TvScanner } from "./tradingview.js";
import { createLogger } from "../core/logger.js";
import { createErrorHandler } from "../core/errorHandler.js";
import { formatNum } from "../core/utils/format.js";

// ─── SCORING ─────────────────────────────────────────────────────────────────

/**
 * Calculates Shadow Velocity Score (Long momentum)
 * Gatekeeper: rvol ≥ 5, change ≥ 2%, value_traded ≥ $10M, price ≥ $2
 * @returns {number|null} SVS score or null if filtered out
 */
export const calcSVS = (stock) => {
    const { rvol_intraday_5m, change_from_open, value_traded, close } = stock;
    if (rvol_intraday_5m == null || change_from_open == null || value_traded == null || close == null) return null;
    if (rvol_intraday_5m < 5.0) return null;
    if (change_from_open < 2.0) return null;
    if (value_traded < 10_000_000) return null;
    if (close < 2.0) return null;

    const log_money = Math.log10(value_traded);
    return change_from_open * rvol_intraday_5m * log_money;
};

/**
 * Calculates Heavy Short Score (Institutional dump)
 * Gatekeeper: change ≤ -2%, value_traded ≥ $50M
 * @returns {number|null} HSS score or null if filtered out
 */
export const calcHSS = (stock) => {
    const { change_from_open, value_traded } = stock;
    if (change_from_open == null || value_traded == null) return null;
    if (change_from_open > -2.0) return null;
    if (value_traded < 50_000_000) return null;

    const log_money = Math.log10(value_traded);
    return Math.abs(change_from_open) * Math.pow(log_money, 2);
};

// ─── DASHBOARD FORMATTING ────────────────────────────────────────────────────

/**
 * Determines emoji based on micro-trend vs previous state
 */
const getEmoji = (symbol, currentChange, prevStocks, now) => {
    const prev = prevStocks.get(symbol);
    if (!prev) return "⚪";

    // New ticker (< 2 min ago)
    if (now - prev.firstSeen < 120_000) return "🟡";
    // Change grew
    if (currentChange > prev.change + 0.3) return "🟢";
    // Change dropped
    if (currentChange < prev.change - 0.3) return "🔴";
    return "⚪";
};

/**
 * Pads/truncates a string to fixed width
 */
const pad = (str, len, alignRight = false) => {
    const s = String(str).substring(0, len);
    return alignRight ? s.padStart(len) : s.padEnd(len);
};

/**
 * Formats the compact dashboard text (HTML monospace)
 */
export const formatDashboard = (alphaStocks, bearStocks, prevStocks, timestamp) => {
    const time = timestamp.toLocaleTimeString("en-US", {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: "America/New_York"
    });
    const now = Date.now();

    const lines = [];
    lines.push(`🔥 <b>SHADOW VELOCITY DASHBOARD</b> [${time}]`);
    lines.push("───────────────────────────────────");

    // Alpha Sprint section
    lines.push("🚀 <b>ALPHA SPRINT</b> (Long Momentum)");
    lines.push("<code>#  Ticker  Price   %Chg   RVOL   SVS</code>");

    if (alphaStocks.length === 0) {
        lines.push("<code>   (no stocks matching criteria)</code>");
    }
    for (let i = 0; i < alphaStocks.length; i++) {
        const s = alphaStocks[i];
        const ticker = s.symbol.split(":")[1] || s.symbol;
        const emoji = getEmoji(s.symbol, s.change_from_open, prevStocks, now);
        const svsStr = formatNum(Math.round(s._svs));

        lines.push(
            `<code>${pad(i + 1 + ".", 3)}${emoji}${pad(ticker, 6)} ` +
            `${pad("$" + s.close.toFixed(s.close >= 100 ? 0 : s.close >= 10 ? 1 : 2), 7, true)} ` +
            `${pad((s.change_from_open >= 0 ? "+" : "") + s.change_from_open.toFixed(0) + "%", 6, true)} ` +
            `${pad(s.rvol_intraday_5m.toFixed(0) + "x", 6, true)} ` +
            `${pad(svsStr, 6, true)}</code>`
        );
    }

    lines.push("───────────────────────────────────");

    // Institutional Bear section
    lines.push("🐻 <b>INSTITUTIONAL BEAR</b> (Short/Avoid)");
    lines.push("<code>#  Ticker  Price   %Chg   Val($)</code>");

    if (bearStocks.length === 0) {
        lines.push("<code>   (no stocks matching criteria)</code>");
    }
    for (let i = 0; i < bearStocks.length; i++) {
        const s = bearStocks[i];
        const ticker = s.symbol.split(":")[1] || s.symbol;
        const emoji = "🔴";

        lines.push(
            `<code>${pad(i + 1 + ".", 3)}${emoji}${pad(ticker, 6)} ` +
            `${pad("$" + s.close.toFixed(s.close >= 100 ? 0 : s.close >= 10 ? 1 : 2), 7, true)} ` +
            `${pad(s.change_from_open.toFixed(0) + "%", 6, true)} ` +
            `${pad("$" + formatNum(s.value_traded), 7, true)}</code>`
        );
    }

    lines.push("───────────────────────────────────");
    lines.push("Статус: ✅ Active");

    return lines.join("\n");
};

// ─── ALERT FORMATTING ────────────────────────────────────────────────────────

const formatNewEntrantAlert = (stock) => {
    const ticker = stock.symbol.split(":")[1] || stock.symbol;
    return [
        `🚨 <b>NEW ALERT: ${ticker}</b>`,
        `⚡️ RVOL: ${stock.rvol_intraday_5m.toFixed(1)} | 📈 Chg: +${stock.change_from_open.toFixed(1)}%`,
        `💵 Value: $${formatNum(stock.value_traded)}`,
        `Спекулятивний вхід. Увага на волатильність!`
    ].join("\n");
};

const formatVolumeSpikeAlert = (stock, prevRvol, currentRvol) => {
    const ticker = stock.symbol.split(":")[1] || stock.symbol;
    return [
        `🔋 <b>${ticker}: Fuel Injection!</b>`,
        `Об'єм різко виріс! RVOL: ${prevRvol.toFixed(0)} → ${currentRvol.toFixed(0)}.`,
        `Ціна пробиває локальний хай?`
    ].join("\n");
};

const formatTrendReversalAlert = (stock, priceDrop) => {
    const ticker = stock.symbol.split(":")[1] || stock.symbol;
    return [
        `⚠️ <b>WARNING: ${ticker} Dropping</b>`,
        `Ціна впала на ${priceDrop.toFixed(1)}% за хвилину. Можливий кінець тренду.`
    ].join("\n");
};

// ─── SERVICE ────────────────────────────────────────────────────────────────

/**
 * Creates the Shadow Velocity Market Scanner service
 * @param {Object} config - App configuration
 * @param {Object} telegramService - Telegram service instance
 * @param {Object} [scanner=TvScanner] - Scanner (injectable for testing)
 */
export const createMarketService = (config, telegramService, scanner = TvScanner) => {
    const logger = createLogger();
    const errorHandler = createErrorHandler(logger);

    // ── State ──
    let dashboardMessageId = null;
    let prevStocks = new Map();           // symbol → { price, change, rvol, firstSeen, timestamp }
    let alertCooldowns = new Map();       // symbol → { time, type }
    let scanTimer = null;
    let dashboardTimer = null;
    let lastScanResult = { alpha: [], bear: [] };
    let isRunning = false;
    let alertCount = 0;

    // ── Config defaults ──
    const SCAN_INTERVAL = config.marketScanIntervalMs ?? 10_000;
    const DASHBOARD_INTERVAL = config.marketDashboardIntervalMs ?? 30_000;
    const COOLDOWN_MS = config.marketAlertCooldownMs ?? 300_000;        // 5 min
    const RVOL_PUMP_DELTA = config.marketRvolPumpDelta ?? 5;            // +5 RVOL points
    const DUMP_THRESHOLD = config.marketDumpThreshold ?? -2;            // -2% price per min
    const TOP_N = 5;

    // ── Core scan logic ──
    const scanOnce = async () => {
        try {
            const { data: rawStocks } = await scanner.getMarketStocks(config);
            const stocks = rawStocks.map(scanner.mapMarketRow);

            // Calculate scores
            const alphaRanked = stocks
                .map(s => {
                    const svs = calcSVS(s);
                    return svs !== null ? { ...s, _svs: svs } : null;
                })
                .filter(Boolean)
                .sort((a, b) => b._svs - a._svs)
                .slice(0, TOP_N);

            const bearRanked = stocks
                .map(s => {
                    const hss = calcHSS(s);
                    return hss !== null ? { ...s, _hss: hss } : null;
                })
                .filter(Boolean)
                .sort((a, b) => b._hss - a._hss)
                .slice(0, TOP_N);

            // ── Detect alert triggers ──
            const now = Date.now();

            for (const stock of alphaRanked) {
                const prev = prevStocks.get(stock.symbol);

                // Trigger 1: NEW ENTRANT — in TOP-5 and not seen for 30 min
                if (!prev || (now - prev.timestamp > 30 * 60_000)) {
                    if (!isCooldown(stock.symbol, "NEW", now)) {
                        await sendAlert(formatNewEntrantAlert(stock), stock.symbol, "NEW", now);
                    }
                }

                // Trigger 2: VOLUME SPIKE — RVOL grew +5 in ~1 min
                if (prev && stock.rvol_intraday_5m - prev.rvol >= RVOL_PUMP_DELTA) {
                    if (!isCooldown(stock.symbol, "PUMP", now)) {
                        await sendAlert(
                            formatVolumeSpikeAlert(stock, prev.rvol, stock.rvol_intraday_5m),
                            stock.symbol, "PUMP", now
                        );
                    }
                }

                // Trigger 3: TREND REVERSAL — price dropped 2%+ since last scan
                if (prev && prev.price > 0) {
                    const priceDrop = ((stock.close - prev.price) / prev.price) * 100;
                    if (priceDrop <= DUMP_THRESHOLD) {
                        // No cooldown for DUMP — always alert
                        await sendAlert(
                            formatTrendReversalAlert(stock, priceDrop),
                            stock.symbol, "DUMP", now
                        );
                    }
                }
            }

            // ── Update prevStocks state ──
            const newPrev = new Map();
            for (const stock of [...alphaRanked, ...bearRanked]) {
                const existing = prevStocks.get(stock.symbol);
                newPrev.set(stock.symbol, {
                    price: stock.close,
                    change: stock.change_from_open,
                    rvol: stock.rvol_intraday_5m,
                    firstSeen: existing?.firstSeen ?? now,
                    timestamp: now
                });
            }
            prevStocks = newPrev;
            lastScanResult = { alpha: alphaRanked, bear: bearRanked };

            logger.info("MarketScanner", `📊 Scan: ${alphaRanked.length} alpha, ${bearRanked.length} bear`);
        } catch (error) {
            errorHandler.handle(error, {
                component: "MarketScanner",
                operation: "scanOnce"
            });
        }
    };

    // ── Dashboard update ──
    const updateDashboard = async () => {
        try {
            const text = formatDashboard(
                lastScanResult.alpha,
                lastScanResult.bear,
                prevStocks,
                new Date()
            );

            if (!dashboardMessageId) {
                // First time — send and pin
                const result = await telegramService.sendMessageHTML(text);
                if (result?.success && result.message) {
                    dashboardMessageId = result.message.message_id;
                    await telegramService.pinMessage(dashboardMessageId);
                    logger.info("MarketScanner", `📌 Dashboard pinned (msg ${dashboardMessageId})`);
                }
            } else {
                // Update existing
                await telegramService.editMessage(dashboardMessageId, text);
            }
        } catch (error) {
            errorHandler.handle(error, {
                component: "MarketScanner",
                operation: "updateDashboard"
            });
        }
    };

    // ── Alert helpers ──
    const isCooldown = (symbol, type, now) => {
        const key = `${symbol}:${type}`;
        const cd = alertCooldowns.get(key);
        return cd && (now - cd < COOLDOWN_MS);
    };

    const sendAlert = async (text, symbol, type, now) => {
        const result = await telegramService.sendMessageHTML(text);
        if (result?.success) {
            alertCooldowns.set(`${symbol}:${type}`, now);
            alertCount++;
            logger.info("MarketScanner", `🔔 Alert [${type}]: ${symbol}`);
        }
    };

    // ── Cleanup old cooldowns (every scan) ──
    const cleanupCooldowns = () => {
        const now = Date.now();
        for (const [key, time] of alertCooldowns) {
            if (now - time > COOLDOWN_MS * 2) {
                alertCooldowns.delete(key);
            }
        }
    };

    // ── Public API ──
    return Object.freeze({
        start: async () => {
            if (isRunning) return;
            isRunning = true;
            logger.info("MarketScanner", "🔥 Shadow Velocity Scanner started");

            // Initial scan + dashboard
            await scanOnce();
            await updateDashboard();

            // Start loops
            scanTimer = setInterval(async () => {
                await scanOnce();
                cleanupCooldowns();
            }, SCAN_INTERVAL);

            dashboardTimer = setInterval(updateDashboard, DASHBOARD_INTERVAL);
        },

        stop: async () => {
            if (!isRunning) return;
            isRunning = false;
            if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
            if (dashboardTimer) { clearInterval(dashboardTimer); dashboardTimer = null; }
            logger.info("MarketScanner", "🛑 Shadow Velocity Scanner stopped");
        },

        shutdown: async () => {
            if (isRunning) {
                if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
                if (dashboardTimer) { clearInterval(dashboardTimer); dashboardTimer = null; }
                isRunning = false;
                logger.info("MarketScanner", "🛑 Shadow Velocity Scanner shutdown");
            }
        },

        getState: () => ({
            isRunning,
            dashboardMessageId,
            alertCount,
            alphaCount: lastScanResult.alpha.length,
            bearCount: lastScanResult.bear.length,
            trackedSymbols: prevStocks.size
        })
    });
};
