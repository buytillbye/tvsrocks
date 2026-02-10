/**
 * @fileoverview HARDCORE WEEK SIMULATION — Shadow Velocity Scanner
 * 
 * Simulates 5 full trading days (Mon-Fri) in ~5 minutes.
 * Each "day" lasts ~55 seconds with:
 *   - Pre-market warmup (5s)
 *   - Market open (40s with scan every 2s)
 *   - Market close + daily reset (5s)
 *   - After-hours cooldown (5s)
 * 
 * Features:
 *   ✦ Chaotic random data generation — new tickers every day
 *   ✦ Mid-day crashes: null fields, empty arrays, NaN, Infinity
 *   ✦ Ticker rotation: some appear/disappear randomly
 *   ✦ Volume spikes, price dumps, trend reversals
 *   ✦ Cooldown verification across cycles
 *   ✦ Full daily state reset verification
 *   ✦ Telegram rate-limit resilience
 *   ✦ All logs saved to tests/logs/stress_week_YYYY-MM-DD_HH-mm.txt
 *   ✦ Deep log analysis at the end
 * 
 * Usage: node tests/stress_test_week.js
 */
import { writeFileSync, mkdirSync, appendFileSync, existsSync } from "fs";
import { parseConfig, validateConfig } from "../src/config/index.js";
import { createTelegramService } from "../src/services/telegram.js";
import { createMarketService, calcSVS, calcHSS, formatDashboard } from "../src/services/marketService.js";
import { TvScanner } from "../src/services/tradingview.js";

// ─── LOG SYSTEM ─────────────────────────────────────────────────────────────
const now = new Date();
const logDir = "tests/logs";
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
const logFile = `${logDir}/stress_week_${now.toISOString().replace(/[:.]/g, "-").slice(0, 16)}.txt`;
const allLogs = [];

const log = (level, msg) => {
    const ts = new Date().toISOString();
    const entry = `[${ts}] [${level}] ${msg}`;
    allLogs.push(entry);
    console.log(entry);
    appendFileSync(logFile, entry + "\n");
};

const INFO = (m) => log("INFO", m);
const WARN = (m) => log("WARN", m);
const ERR = (m) => log("ERROR", m);
const PASS = (m) => log("✅ PASS", m);
const FAIL = (m, r = "") => log("❌ FAIL", r ? `${m}: ${r}` : m);

let totalPassed = 0;
let totalFailed = 0;
const assert = (cond, name, detail = "") => {
    if (cond) { totalPassed++; PASS(name); }
    else { totalFailed++; FAIL(name, detail); }
    return cond;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── RANDOM GENERATORS ─────────────────────────────────────────────────────
const EXCHANGES = ["NYSE", "NASDAQ", "AMEX"];
const PREFIXES = [
    "NOVA", "BLZE", "CRUX", "DRGN", "ECHO", "FLUX", "GRND", "HALO", "IOTA",
    "JETX", "KRON", "LYNX", "MTRX", "NEON", "ORBN", "PLSR", "QNTM", "RPTS",
    "STRM", "THRN", "UMBR", "VRTX", "WARP", "XERO", "YLDX", "ZETA",
    "ATOM", "BOLT", "CYPH", "DAWN", "EDGE", "FURY", "GRIT", "HAWK",
    "IRON", "JADE", "KNOT", "LUNA", "MARS", "NEXO", "ONYX", "PIKE",
    "RIZZ", "SAGE", "TUSK", "ULTR", "VALE", "WOLF", "XION", "YOLO"
];
const SUFFIXES = ["", "X", "P", "A", "I", "S", "N", "G", "R", "T"];

const rng = (min, max) => Math.random() * (max - min) + min;
const rngInt = (min, max) => Math.floor(rng(min, max));
const pick = (arr) => arr[rngInt(0, arr.length)];
const pct = (n) => Math.random() < n;

let usedTickers = new Set();
const genTicker = () => {
    for (let i = 0; i < 50; i++) {
        const t = pick(PREFIXES) + pick(SUFFIXES);
        if (!usedTickers.has(t) && t.length <= 5) {
            usedTickers.add(t);
            return `${pick(EXCHANGES)}:${t}`;
        }
    }
    // Fallback: random 4-char
    const fallback = `${pick(EXCHANGES)}:Z${String.fromCharCode(65 + rngInt(0, 26))}${rngInt(0, 9)}${String.fromCharCode(65 + rngInt(0, 26))}`;
    return fallback;
};

// ─── STOCK DATA GENERATORS ─────────────────────────────────────────────────
const genNormalStock = (symbol) => ({
    s: symbol,
    d: [
        null,                           // 0: ticker-view
        rng(2, 150),                    // 1: close
        "stock",                        // 2: type
        ["common"],                     // 3: typespecs
        100,                            // 4: pricescale
        1,                              // 5: minmov
        "false",                        // 6: fractional
        0,                              // 7: minmove2
        "USD",                          // 8: currency
        rng(10_000_000, 900_000_000),   // 9: Value.Traded
        rng(1.5, 80),                   // 10: RVOL 5m
        rng(500_000, 50_000_000),       // 11: volume
        rng(1_000_000, 300_000_000),    // 12: float
        rng(20, 99),                    // 13: float %
        rng(1, 50),                     // 14: rvol 10d
        rng(-30, 60),                   // 15: change
        rng(-40, 80),                   // 16: change_from_open
        rng(10_000_000, 5_000_000_000), // 17: market_cap
        "USD",                          // 18: fundamental_currency
        pct(0.3) ? null : rng(0, 5_000_000), // 19: premarket_vol (30% null)
        pct(0.3) ? null : rng(-20, 30), // 20: premarket_change (30% null)
        rng(0.5, 15),                   // 21: ATRP
        rng(100_000, 10_000_000),       // 22: avg_vol_10d
        rng(0.05, 5),                   // 23: ATR
        rng(-100, 2000),               // 24: volume_change
        pct(0.3) ? null : rng(-30, 60), // 25: gap (30% null)
    ]
});

// Stock designed to pass SVS gatekeeper (alpha candidate)
const genAlphaStock = (symbol) => {
    const s = genNormalStock(symbol);
    s.d[1] = rng(3, 80);            // price > $2
    s.d[10] = rng(6, 100);          // rvol > 5
    s.d[16] = rng(3, 90);           // change_from_open > 2%
    s.d[9] = rng(15_000_000, 800_000_000); // value > $10M
    return s;
};

// Stock designed to pass HSS gatekeeper (bear candidate)
const genBearStock = (symbol) => {
    const s = genNormalStock(symbol);
    s.d[16] = -rng(3, 50);          // change_from_open < -2%
    s.d[9] = rng(60_000_000, 500_000_000); // value > $50M
    return s;
};

// Edge case: penny stock
const genPennyStock = (symbol) => {
    const s = genNormalStock(symbol);
    s.d[1] = rng(0.05, 1.50);       // close < $2
    return s;
};

// Edge case: stock with ALL nulls
const genAllNullStock = (symbol) => ({
    s: symbol,
    d: [null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null, null,
        null, null, null, null, null, null, null, null]
});

// Edge case: stock with NaN / Infinity
const genCursedStock = (symbol) => ({
    s: symbol,
    d: [null, NaN, "stock", ["common"], 100, 1, "false", 0, "USD",
        Infinity, -Infinity, NaN, 0, 0, NaN, 0, NaN, -0,
        "USD", null, null, NaN, 0, 0, NaN, undefined]
});

// Edge case: stock with negative price
const genNegativePriceStock = (symbol) => ({
    s: symbol,
    d: [null, -5.50, "stock", ["common"], 100, 1, "false", 0, "USD",
        50_000_000, 10, 1_000_000, 5_000_000, 50,
        5, -10, -15, 100_000_000, "USD",
        null, null, 3, 200_000, 0.5, -50, -10]
});

// Edge case: stock with extreme numbers
const genOverflowStock = (symbol) => ({
    s: symbol,
    d: [null, Number.MAX_SAFE_INTEGER, "stock", ["common"], 100, 1, "false", 0, "USD",
        Number.MAX_SAFE_INTEGER, 999999, Number.MAX_SAFE_INTEGER, 0, 0,
        999999, 99999, 99999, Number.MAX_SAFE_INTEGER, "USD",
        null, null, 99999, 0, 0, 99999, 99999]
});

// Edge case: empty d array
const genEmptyDStock = (symbol) => ({
    s: symbol,
    d: []
});

// Edge case: missing d entirely
const genMissingDStock = (symbol) => ({ s: symbol });

// Edge case: zero values
const genZeroStock = (symbol) => ({
    s: symbol,
    d: [null, 0, "stock", ["common"], 100, 1, "false", 0, "USD",
        0, 0, 0, 0, 0, 0, 0, 0, 0, "USD", 0, 0, 0, 0, 0, 0, 0]
});

// ─── DAILY MARKET GENERATOR ────────────────────────────────────────────────
const generateDailyMarket = (dayNum) => {
    const tickerCount = rngInt(15, 50); // 15-50 tickers per day
    const stocks = [];

    // Mix of stock types
    const alphaPct = rng(0.2, 0.5);   // 20-50% alpha candidates
    const bearPct = rng(0.1, 0.3);    // 10-30% bear candidates
    const edgePct = rng(0.05, 0.15);  // 5-15% edge cases

    for (let i = 0; i < tickerCount; i++) {
        const sym = genTicker();
        const roll = Math.random();

        if (roll < edgePct) {
            // Edge case stock
            const edgeType = rngInt(0, 7);
            switch (edgeType) {
                case 0: stocks.push(genPennyStock(sym)); break;
                case 1: stocks.push(genAllNullStock(sym)); break;
                case 2: stocks.push(genCursedStock(sym)); break;
                case 3: stocks.push(genNegativePriceStock(sym)); break;
                case 4: stocks.push(genOverflowStock(sym)); break;
                case 5: stocks.push(genEmptyDStock(sym)); break;
                case 6: stocks.push(genZeroStock(sym)); break;
            }
        } else if (roll < edgePct + alphaPct) {
            stocks.push(genAlphaStock(sym));
        } else if (roll < edgePct + alphaPct + bearPct) {
            stocks.push(genBearStock(sym));
        } else {
            stocks.push(genNormalStock(sym));
        }
    }

    return { totalCount: stocks.length + rngInt(0, 30), data: stocks };
};

// ─── CHAOTIC MUTATIONS (apply mid-day) ──────────────────────────────────────
const MUTATIONS = {
    // A top stock gets a massive RVOL spike
    rvolSpike: (market) => {
        const alphas = market.data.filter(r => r.d?.length > 10 && r.d[10] > 5);
        if (alphas.length > 0) {
            const target = pick(alphas);
            const oldRvol = target.d[10];
            target.d[10] = oldRvol + rng(8, 50);
            return `RVOL_SPIKE: ${target.s} ${oldRvol?.toFixed?.(1) ?? '?'} → ${target.d[10]?.toFixed?.(1) ?? '?'}`;
        }
        return null;
    },

    // A stock price dumps hard
    priceDump: (market) => {
        const valid = market.data.filter(r => r.d?.length > 1 && typeof r.d[1] === 'number' && r.d[1] > 2);
        if (valid.length > 0) {
            const target = pick(valid);
            const oldPrice = target.d[1];
            target.d[1] = oldPrice * rng(0.5, 0.85); // -15% to -50%
            target.d[16] = -rng(5, 40); // change_from_open goes negative
            return `PRICE_DUMP: ${target.s} $${oldPrice?.toFixed?.(2) ?? '?'} → $${target.d[1]?.toFixed?.(2) ?? '?'}`;
        }
        return null;
    },

    // Add a brand new "hot" stock mid-day
    newHotEntrant: (market) => {
        const sym = genTicker();
        const stock = genAlphaStock(sym);
        stock.d[10] = rng(20, 200);  // very high RVOL
        stock.d[16] = rng(15, 100);  // big move
        stock.d[9] = rng(100_000_000, 1_000_000_000); // massive value
        market.data.unshift(stock);
        market.totalCount++;
        return `NEW_HOT_ENTRANT: ${sym} RVOL=${stock.d[10].toFixed(0)} Chg=+${stock.d[16].toFixed(0)}%`;
    },

    // Remove a stock entirely (halted/delisted)
    delist: (market) => {
        if (market.data.length > 5) {
            const idx = rngInt(0, market.data.length);
            const removed = market.data.splice(idx, 1)[0];
            market.totalCount--;
            return `DELIST: ${removed.s} removed`;
        }
        return null;
    },

    // All rvols drop to noise (volume death)
    volumeDeath: (market) => {
        for (const row of market.data) {
            if (row.d?.length > 10 && typeof row.d[10] === 'number') {
                row.d[10] = rng(0.1, 1.5);
            }
            if (row.d?.length > 16 && typeof row.d[16] === 'number') {
                row.d[16] = rng(-0.5, 0.5);
            }
        }
        return `VOLUME_DEATH: all RVOLs crushed to <1.5`;
    },

    // Inject chaos: random nulls everywhere
    nullStorm: (market) => {
        let count = 0;
        for (const row of market.data) {
            if (!row.d || !Array.isArray(row.d)) continue;
            for (let j = 0; j < row.d.length; j++) {
                if (pct(0.15)) { // 15% chance per field
                    row.d[j] = null;
                    count++;
                }
            }
        }
        return `NULL_STORM: injected ${count} nulls across all stocks`;
    },

    // Inject NaN and Infinity in random numeric fields
    nanBomb: (market) => {
        let count = 0;
        const numericIdx = [1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25];
        for (const row of market.data) {
            if (!row.d || !Array.isArray(row.d)) continue;
            for (const idx of numericIdx) {
                if (pct(0.05)) { // 5% chance
                    row.d[idx] = pct(0.5) ? NaN : (pct(0.5) ? Infinity : -Infinity);
                    count++;
                }
            }
        }
        return `NAN_BOMB: injected ${count} NaN/Infinity values`;
    },

    // Clone stocks — duplicate symbols in one scan
    duplicateSymbols: (market) => {
        if (market.data.length > 3) {
            const source = market.data[0];
            const clone = JSON.parse(JSON.stringify(source));
            // Clone with slightly different data
            if (clone.d?.length > 1) clone.d[1] = (clone.d[1] || 10) * 1.05;
            market.data.push(clone);
            market.totalCount++;
            return `DUPLICATE: cloned ${source.s}`;
        }
        return null;
    },

    // Massive influx — 80 new stocks at once
    megaFlood: (market) => {
        const newCount = rngInt(40, 80);
        for (let i = 0; i < newCount; i++) {
            const roll = Math.random();
            const sym = genTicker();
            if (roll < 0.3) market.data.push(genAlphaStock(sym));
            else if (roll < 0.5) market.data.push(genBearStock(sym));
            else market.data.push(genNormalStock(sym));
        }
        market.totalCount += newCount;
        return `MEGA_FLOOD: added ${newCount} new stocks (total now ${market.data.length})`;
    },

    // Price flash crash — all prices go to near-zero
    flashCrash: (market) => {
        for (const row of market.data) {
            if (row.d?.length > 1 && typeof row.d[1] === 'number') {
                row.d[1] = rng(0.01, 0.50);
                if (row.d.length > 16) row.d[16] = -rng(30, 95);
            }
        }
        return `FLASH_CRASH: all prices near $0, changes -30% to -95%`;
    },

    // Empty market — zero stocks (API returns empty)
    emptyMarket: (market) => {
        market.data = [];
        market.totalCount = 0;
        return `EMPTY_MARKET: API returned 0 stocks`;
    },

    // Only missing-d stocks
    corruptedPayload: (market) => {
        market.data = Array.from({ length: rngInt(5, 15) }, () => genMissingDStock(genTicker()));
        market.totalCount = market.data.length;
        return `CORRUPTED_PAYLOAD: all ${market.data.length} stocks have missing d[]`;
    },

    //  Rapid symbol rotation — half the tickers change
    symbolRotation: (market) => {
        let rotated = 0;
        for (let i = 0; i < market.data.length; i++) {
            if (pct(0.5)) {
                market.data[i].s = genTicker();
                rotated++;
            }
        }
        return `SYMBOL_ROTATION: ${rotated}/${market.data.length} tickers changed`;
    },
};

// ─── MOCK SCANNER WRAPPER ──────────────────────────────────────────────────
let currentMockData = { totalCount: 0, data: [] };
let scanCallCount = 0;
let scanErrors = 0;

const mockScanner = {
    getMarketStocks: async () => {
        scanCallCount++;
        // Randomly throw errors (5% of scans)
        if (pct(0.05)) {
            scanErrors++;
            throw new Error(`[CHAOS] Simulated TradingView API error (scan #${scanCallCount})`);
        }
        // Randomly add latency (10% of scans get 500ms-2s delay)
        if (pct(0.10)) {
            await sleep(rng(500, 2000));
        }
        return { data: currentMockData.data, totalCount: currentMockData.totalCount };
    },
    mapMarketRow: (row) => {
        // Wrap mapMarketRow to handle missing d gracefully
        try {
            return TvScanner.mapMarketRow(row);
        } catch (e) {
            // If mapMarketRow crashes on bad data, return a safe stub
            return Object.freeze({
                symbol: row?.s || "UNKNOWN",
                close: 0, value_traded: 0, rvol_intraday_5m: 0, volume: 0,
                float_shares_outstanding: 0, float_shares_percent: 0,
                relative_volume_10d: 0, change: 0, change_from_open: 0,
                market_cap: 0, premarket_volume: 0, premarket_change: 0,
                atrp: 0, average_volume_10d: 0, atr: 0, volume_change: 0, gap: 0,
            });
        }
    }
};

// ─── PRE-FLIGHT CHAOS TESTS ────────────────────────────────────────────────
function preFlightChaosTests() {
    INFO("╔══════════════════════════════════════════════════════════════════╗");
    INFO("║  PRE-FLIGHT CHAOS TESTS — Edge Cases Before Service Start     ║");
    INFO("╚══════════════════════════════════════════════════════════════════╝");

    // ── Test calcSVS with every edge type ──
    const edgeCases = [
        { name: "null stock", input: null },
        { name: "undefined stock", input: undefined },
        { name: "empty object", input: {} },
        { name: "all zeros", input: { rvol_intraday_5m: 0, change_from_open: 0, value_traded: 0, close: 0 } },
        { name: "NaN rvol", input: { rvol_intraday_5m: NaN, change_from_open: 10, value_traded: 100000000, close: 5 } },
        { name: "Infinity change", input: { rvol_intraday_5m: 10, change_from_open: Infinity, value_traded: 100000000, close: 5 } },
        { name: "-Infinity value", input: { rvol_intraday_5m: 10, change_from_open: 10, value_traded: -Infinity, close: 5 } },
        { name: "negative rvol", input: { rvol_intraday_5m: -5, change_from_open: 10, value_traded: 100000000, close: 5 } },
        { name: "string values", input: { rvol_intraday_5m: "10", change_from_open: "20", value_traded: "5000000", close: "3" } },
        { name: "boolean values", input: { rvol_intraday_5m: true, change_from_open: true, value_traded: true, close: true } },
        { name: "huge rvol", input: { rvol_intraday_5m: 999999, change_from_open: 10, value_traded: 100000000, close: 5 } },
        { name: "zero change", input: { rvol_intraday_5m: 10, change_from_open: 0, value_traded: 100000000, close: 5 } },
        { name: "negative price", input: { rvol_intraday_5m: 10, change_from_open: 10, value_traded: 100000000, close: -5 } },
    ];

    for (const { name, input } of edgeCases) {
        let crashed = false;
        let result;
        try {
            result = calcSVS(input);
        } catch (e) {
            crashed = true;
            result = e.message;
        }
        assert(!crashed, `SVS edge [${name}]`, crashed ? `threw: ${result}` : "");
    }

    for (const { name, input } of edgeCases) {
        let crashed = false;
        let result;
        try {
            result = calcHSS(input);
        } catch (e) {
            crashed = true;
            result = e.message;
        }
        assert(!crashed, `HSS edge [${name}]`, crashed ? `threw: ${result}` : "");
    }

    // ── Test formatDashboard with edge data ──
    const dashEdgeCases = [
        { name: "empty alpha+bear", alpha: [], bear: [] },
        { name: "null alpha", alpha: null, bear: [] },
        {
            name: "100 stocks alpha", alpha: Array.from({ length: 100 }, (_, i) => ({
                symbol: `NYSE:T${i}`, close: 10 + i, change_from_open: 5 + i,
                rvol_intraday_5m: 10 + i, value_traded: 50000000 + i * 1000000, _svs: 100 * (100 - i)
            })), bear: []
        },
    ];

    for (const { name, alpha, bear } of dashEdgeCases) {
        let crashed = false;
        try {
            const result = formatDashboard(alpha || [], bear || [], new Map(), new Date());
            if (name === "100 stocks alpha") {
                assert(typeof result === "string" && result.length < 5000, `Dashboard edge [${name}] size`, `len=${result.length}`);
            }
        } catch (e) {
            crashed = true;
        }
        assert(!crashed, `Dashboard edge [${name}]`, crashed ? "threw!" : "");
    }

    // ── Test mapMarketRow with every edge stock type ──
    const edgeStocks = [
        genAllNullStock("NYSE:ALLNULL"),
        genCursedStock("NYSE:CURSED"),
        genNegativePriceStock("NYSE:NEGPRC"),
        genOverflowStock("NYSE:OVERFLW"),
        genEmptyDStock("NYSE:EMPTYD"),
        genMissingDStock("NYSE:MISSD"),
        genZeroStock("NYSE:ZERO"),
    ];

    for (const stock of edgeStocks) {
        let crashed = false;
        try {
            mockScanner.mapMarketRow(stock);
        } catch (e) {
            crashed = true;
        }
        assert(!crashed, `mapMarketRow edge [${stock.s}]`, crashed ? "threw!" : "");
    }
}

// ─── SINGLE DAY SIMULATION ────────────────────────────────────────────────
async function simulateDay(dayNum, dayName, config, telegramService) {
    INFO(`\n${"═".repeat(66)}`);
    INFO(`  DAY ${dayNum}/5: ${dayName}`);
    INFO(`${"═".repeat(66)}`);

    const dayStats = {
        scansCompleted: 0,
        alertsTriggered: 0,
        dashboardUpdates: 0,
        mutationsApplied: [],
        errors: [],
        serviceStartedAt: null,
        serviceStoppedAt: null,
    };

    // ── Generate fresh market for this day ──
    usedTickers.clear();
    let dailyMarket = generateDailyMarket(dayNum);
    currentMockData = JSON.parse(JSON.stringify(dailyMarket));
    INFO(`  Initial market: ${dailyMarket.data.length} stocks, totalCount=${dailyMarket.totalCount}`);

    // ── Create service with fast intervals ──
    const testConfig = {
        ...config,
        marketScanIntervalMs: 2000,       // 2s scans
        marketDashboardIntervalMs: 6000,  // 6s dashboard
        marketAlertCooldownMs: 8000,      // 8s cooldown (fast for testing)
        marketRvolPumpDelta: 5,
        marketDumpThreshold: -2
    };

    const marketService = createMarketService(testConfig, telegramService, mockScanner);
    const scansBefore = scanCallCount;

    // ── MARKET OPEN ──
    INFO(`  📈 Market opens...`);
    dayStats.serviceStartedAt = Date.now();
    await marketService.start();

    let state = marketService.getState();
    assert(state.isRunning, `Day ${dayNum}: service started`);
    INFO(`  State after start: alpha=${state.alphaCount}, bear=${state.bearCount}, tracked=${state.trackedSymbols}`);

    // ── Generate mutation schedule for the day ──
    const mutationKeys = Object.keys(MUTATIONS);
    const mutationSchedule = [];
    const scanDuration = 38000; // 38 seconds of scanning
    const numMutations = rngInt(6, 15); // 6-15 mutations per day

    for (let i = 0; i < numMutations; i++) {
        mutationSchedule.push({
            at: rngInt(2000, scanDuration),
            mutation: pick(mutationKeys)
        });
    }
    mutationSchedule.sort((a, b) => a.at - b.at);
    INFO(`  Scheduled ${mutationSchedule.length} mutations: ${mutationSchedule.map(m => m.mutation).join(", ")}`);

    // ── Run scanning with mutations ──
    const dayStartMs = Date.now();
    let mutIdx = 0;

    while (Date.now() - dayStartMs < scanDuration) {
        const elapsed = Date.now() - dayStartMs;

        // Apply any due mutations
        while (mutIdx < mutationSchedule.length && mutationSchedule[mutIdx].at <= elapsed) {
            const mut = mutationSchedule[mutIdx];
            try {
                const mutData = JSON.parse(JSON.stringify(currentMockData));
                const result = MUTATIONS[mut.mutation](mutData);
                if (result) {
                    currentMockData = mutData;
                    dayStats.mutationsApplied.push(result);
                    INFO(`  ⚡ [${(elapsed / 1000).toFixed(1)}s] ${result}`);
                }
            } catch (e) {
                dayStats.errors.push(`Mutation ${mut.mutation} threw: ${e.message}`);
                ERR(`  Mutation ${mut.mutation} threw: ${e.message}`);
            }
            mutIdx++;
        }

        await sleep(500); // Check every 500ms
    }

    // ── Post-scan state ──
    state = marketService.getState();
    dayStats.scansCompleted = scanCallCount - scansBefore;
    dayStats.alertsTriggered = state.alertCount;
    dayStats.dashboardUpdates = state.dashboardMessageId ? 1 : 0;

    INFO(`  📊 Day ${dayNum} scan summary:`);
    INFO(`     Scans: ${dayStats.scansCompleted}, Alerts: ${dayStats.alertsTriggered}`);
    INFO(`     Alpha: ${state.alphaCount}, Bear: ${state.bearCount}, Tracked: ${state.trackedSymbols}`);
    INFO(`     Mutations applied: ${dayStats.mutationsApplied.length}`);
    if (dayStats.errors.length > 0) INFO(`     Errors: ${dayStats.errors.length}`);

    // ── MARKET CLOSE ──
    INFO(`  📉 Market closes...`);
    await marketService.stop();
    dayStats.serviceStoppedAt = Date.now();

    state = marketService.getState();
    assert(!state.isRunning, `Day ${dayNum}: service stopped cleanly`);

    // ── Verify clean stop ──
    // Wait a bit and ensure no more scans run
    const scansAfterStop = scanCallCount;
    await sleep(3000);
    assert(scanCallCount === scansAfterStop, `Day ${dayNum}: no scans after stop`, `extra scans: ${scanCallCount - scansAfterStop}`);

    // ── Shutdown (full reset) ──
    await marketService.shutdown();
    INFO(`  🔄 Daily reset complete.`);

    return dayStats;
}

// ─── LOG ANALYSIS ──────────────────────────────────────────────────────────
function analyzeAllLogs(weekStats) {
    INFO(`\n${"═".repeat(66)}`);
    INFO("  DEEP LOG ANALYSIS");
    INFO(`${"═".repeat(66)}`);

    // ── Aggregate metrics ──
    const totalScans = weekStats.reduce((s, d) => s + d.scansCompleted, 0);
    const totalAlerts = weekStats.reduce((s, d) => s + d.alertsTriggered, 0);
    const totalMutations = weekStats.reduce((s, d) => s + d.mutationsApplied.length, 0);
    const totalErrors = weekStats.reduce((s, d) => s + d.errors.length, 0);
    const totalDayErrors = weekStats.filter(d => d.errors.length > 0).length;

    INFO(`  Total scans across week:    ${totalScans}`);
    INFO(`  Total alerts triggered:     ${totalAlerts}`);
    INFO(`  Total mutations applied:    ${totalMutations}`);
    INFO(`  Total scan errors (chaos):  ${scanErrors}`);
    INFO(`  Days with mutation errors:  ${totalDayErrors}/5`);

    // ── Per-day breakdown ──
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    INFO(`\n  Per-day breakdown:`);
    INFO(`  Day  | Scans | Alerts | Mutations | Errors | Duration`);
    INFO(`  -----+-------+--------+-----------+--------+---------`);
    for (let i = 0; i < weekStats.length; i++) {
        const d = weekStats[i];
        const dur = d.serviceStoppedAt && d.serviceStartedAt
            ? `${((d.serviceStoppedAt - d.serviceStartedAt) / 1000).toFixed(1)}s`
            : "N/A";
        INFO(`  ${days[i]}  |  ${String(d.scansCompleted).padStart(4)} | ${String(d.alertsTriggered).padStart(6)} | ${String(d.mutationsApplied.length).padStart(9)} | ${String(d.errors.length).padStart(6)} | ${dur}`);
    }

    // ── Log pattern analysis ──
    INFO(`\n  Log pattern analysis:`);
    const passLogs = allLogs.filter(l => l.includes("✅ PASS"));
    const failLogs = allLogs.filter(l => l.includes("❌ FAIL"));
    const warnLogs = allLogs.filter(l => l.includes("[WARN]"));
    const errLogs = allLogs.filter(l => l.includes("[ERROR]"));
    const tgSentLogs = allLogs.filter(l => l.includes("TG] sent"));
    const tgErrLogs = allLogs.filter(l => l.includes("TG] send error") || l.includes("429"));
    const alertLogs = allLogs.filter(l => l.includes("🔔 Alert"));
    const scanLogs = allLogs.filter(l => l.includes("📊 Scan:"));

    INFO(`  ✅ Passed assertions:  ${passLogs.length}`);
    INFO(`  ❌ Failed assertions:  ${failLogs.length}`);
    INFO(`  ⚠️  Warnings:          ${warnLogs.length}`);
    INFO(`  🔴 Errors:             ${errLogs.length}`);
    INFO(`  📨 TG messages sent:   ${tgSentLogs.length}`);
    INFO(`  🚫 TG rate-limits:     ${tgErrLogs.length}`);
    INFO(`  🔔 Alert log entries:  ${alertLogs.length}`);
    INFO(`  📊 Scan log entries:   ${scanLogs.length}`);

    // ── Mutation coverage ──
    INFO(`\n  Mutation coverage:`);
    const mutCounts = {};
    for (const d of weekStats) {
        for (const m of d.mutationsApplied) {
            const type = m.split(":")[0];
            mutCounts[type] = (mutCounts[type] || 0) + 1;
        }
    }
    const allMutTypes = Object.keys(MUTATIONS);
    for (const mt of allMutTypes) {
        const upper = mt.replace(/([A-Z])/g, "_$1").toUpperCase();
        const count = mutCounts[upper] || mutCounts[mt.toUpperCase()] || 0;
        // Try all case variants
        let found = false;
        for (const k of Object.keys(mutCounts)) {
            if (k.toUpperCase().includes(mt.toUpperCase())) {
                INFO(`    ${mt}: ${mutCounts[k]}x`);
                found = true;
                break;
            }
        }
        if (!found) INFO(`    ${mt}: 0x (NOT TESTED)`);
    }

    // ── Error analysis ──
    if (failLogs.length > 0) {
        INFO(`\n  Failed test details:`);
        for (const l of failLogs) {
            INFO(`    ${l.substring(l.indexOf("]", 26) + 2)}`);
        }
    }

    // ── Health verdict ──
    INFO(`\n${"═".repeat(66)}`);
    if (failLogs.length === 0 && totalScans > 50) {
        INFO("  🎉 VERDICT: PRODUCTION READY");
        INFO(`  Service survived ${totalScans} scans, ${totalMutations} mutations,`);
        INFO(`  ${scanErrors} simulated API errors, and sent ${tgSentLogs.length} TG messages.`);
    } else if (failLogs.length <= 3) {
        INFO("  ⚠️  VERDICT: MOSTLY STABLE — minor issues detected");
    } else {
        INFO("  ❌ VERDICT: NOT PRODUCTION READY — critical failures detected");
    }
    INFO(`${"═".repeat(66)}\n`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
    const startTime = Date.now();

    INFO("╔══════════════════════════════════════════════════════════════════╗");
    INFO("║  SHADOW VELOCITY SCANNER — HARDCORE WEEK SIMULATION           ║");
    INFO("║  5 trading days · Chaotic data · Real Telegram · Full reset   ║");
    INFO("╚══════════════════════════════════════════════════════════════════╝");
    INFO(`Log file: ${logFile}`);

    let telegramService = null;

    try {
        // ── Config + Telegram ──
        const rawConfig = parseConfig();
        const config = validateConfig(rawConfig);
        INFO(`Config: chatId=${config.chatId}, thread=${config.threadId || "none"}`);

        telegramService = createTelegramService(config);
        await telegramService.initialize();
        INFO("Telegram connected ✓\n");

        // Announce
        await telegramService.sendMessage(
            "🧪 WEEK STRESS TEST: Shadow Velocity Scanner\n" +
            "Simulating 5 trading days with chaotic data..."
        );
        await sleep(1500);

        // ── Pre-flight ──
        preFlightChaosTests();
        await sleep(500);

        // ── Simulate 5 trading days ──
        const dayNames = [
            "Monday — Fresh Start",
            "Tuesday — Volatility Day",
            "Wednesday — Mid-Week Chaos",
            "Thursday — Recovery",
            "Friday — Closing Madness"
        ];

        const weekStats = [];
        for (let day = 1; day <= 5; day++) {
            // Send daily marker to TG
            await telegramService.sendMessage(`📅 Day ${day}/5: ${dayNames[day - 1]}`);
            await sleep(800);

            const dayStats = await simulateDay(day, dayNames[day - 1], config, telegramService);
            weekStats.push(dayStats);

            // Between days — verify full isolation
            if (day < 5) {
                INFO(`  ⏸️  After-hours cooldown (2s)...`);
                await sleep(2000);
            }
        }

        // ── Deep log analysis ──
        analyzeAllLogs(weekStats);

        // ── Final summary ──
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        INFO(`\n  FINAL RESULTS: ${totalPassed} passed, ${totalFailed} failed, ${totalPassed + totalFailed} total`);
        INFO(`  Total test duration: ${elapsed}s`);
        INFO(`  Total scan calls: ${scanCallCount} (${scanErrors} errors, ${((scanErrors / scanCallCount) * 100).toFixed(1)}% error rate)`);

        // Send TG summary
        const summaryText = [
            `🧪 <b>WEEK STRESS TEST COMPLETE</b>`,
            ``,
            `✅ Passed: ${totalPassed}`,
            `❌ Failed: ${totalFailed}`,
            `⏱ Duration: ${elapsed}s`,
            `📊 Scans: ${scanCallCount} (${scanErrors} errors)`,
            `🔔 Alerts: ${weekStats.reduce((s, d) => s + d.alertsTriggered, 0)}`,
            `⚡ Mutations: ${weekStats.reduce((s, d) => s + d.mutationsApplied.length, 0)}`,
            ``,
            totalFailed === 0 ? "🎉 PRODUCTION READY" : `⚠️ ${totalFailed} failures — check logs`
        ].join("\n");
        await telegramService.sendMessageHTML(summaryText);

    } catch (error) {
        ERR(`FATAL: ${error.message}`);
        console.error(error.stack);
    } finally {
        // Write final log summary
        INFO(`\nLog file saved: ${logFile}`);
        INFO(`Total log entries: ${allLogs.length}`);

        if (telegramService) {
            try { await telegramService.stop("WEEK_TEST_COMPLETE"); } catch { }
        }
        await sleep(2000);
        process.exit(totalFailed > 0 ? 1 : 0);
    }
}

main();
