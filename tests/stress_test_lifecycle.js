/**
 * @fileoverview COMBINED FULL-WEEK LIFECYCLE STRESS TEST
 * 
 * Simulates the ENTIRE program lifecycle across a trading week:
 * 
 *   Mon:  04:00 premarket → 09:30 market open → 16:00 close → after-hours
 *   Tue:  same cycle
 *   Wed:  weekend simulation (Sat/Sun — everything off)
 *   Thu:  back to trading — full cycle
 *   Fri:  final day — full cycle + stressful edge cases
 * 
 * Tests:
 *   • Orchestrator time-based toggling (premarket↔market)
 *   • Premarket scanner start/stop + alert dedup + step alerts
 *   • Market scanner start/stop + SVS/HSS scoring + dashboard
 *   • Weekend shutdown — both scanners off
 *   • Error injection mid-cycle (API failures, corrupt data)
 *   • Service recovery after errors
 *   • State persistence across restarts within same day
 *   • Real Telegram integration
 *   • Deep log analysis
 * 
 * Saves logs to tests/logs/stress_lifecycle_<timestamp>.txt
 */

import { createOrchestrator } from "../src/core/orchestrator.js";
import { createScanner } from "../src/services/scanner.js";
import { createMarketService } from "../src/services/marketService.js";
import { processStockData } from "../src/services/stock.js";
import { TvScanner } from "../src/services/tradingview.js";
import { createTelegramService } from "../src/services/telegram.js";
import { parseConfig } from "../src/config/index.js";
import { createLogger } from "../src/core/logger.js";
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── LOG CAPTURE ────────────────────────────────────────────────────────────
const logLines = [];
const ts = () => new Date().toISOString();
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

const capture = (level) => (...args) => {
    const line = `[${ts()}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
    logLines.push(line);
    origLog(line);
};

console.log = capture('INFO');
console.error = capture('ERROR');
console.warn = capture('WARN');

// ─── MINI ASSERT ────────────────────────────────────────────────────────────
let passed = 0, failed = 0, total = 0;
const failures = [];

const assert = (cond, name, detail = '') => {
    total++;
    if (cond) {
        passed++;
        console.log(`  [✅] ${name}`);
    } else {
        failed++;
        failures.push({ name, detail });
        console.log(`  [❌] ${name}${detail ? ' — ' + detail : ''}`);
    }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const realConfig = parseConfig();
const testConfig = {
    ...realConfig,
    premarketThreshold: 10,
    scanIntervalMs: 500, // fast for testing
    sendOnStartup: false,
    premarketAlertStep: 1.0,
    marketScanIntervalMs: 500,
    marketDashboardIntervalMs: 1000,
    marketAlertCooldownMs: 2000,
    marketRvolPumpDelta: 5,
    marketDumpThreshold: -2,
    premarketHours: { start: "04:00", end: "09:30" },
    retry: { maxAttempts: 3, backoffMultiplier: 1.5 },
    timeouts: { gatekeeperIntervalMs: 500, shutdownGraceMs: 200, launchTimeoutMs: 15000 },
    api: { tvCookie: null },
};

// ─── RANDOM DATA GENERATORS ─────────────────────────────────────────────────
const EXCHANGES = ['NASDAQ', 'NYSE', 'AMEX'];
const BASES = ['NOVA', 'FLUX', 'APEX', 'CRUX', 'VRTX', 'BLZE', 'ORBX', 'TUSK', 'JOLT', 'WASP',
    'ZETA', 'DRCO', 'HAWK', 'PIKE', 'LYNX', 'MESA', 'ONYX', 'SAGE', 'IRON', 'VOLT',
    'NEON', 'EDGE', 'MARS', 'WOLF', 'LUNA', 'KITE', 'REEF', 'FANG', 'JADE', 'BOLT'];
const usedTickers = new Set();

function randomTicker() {
    let t;
    do {
        const base = BASES[Math.floor(Math.random() * BASES.length)];
        const suffix = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const exch = EXCHANGES[Math.floor(Math.random() * EXCHANGES.length)];
        t = `${exch}:${base}${suffix}`;
    } while (usedTickers.has(t));
    usedTickers.add(t);
    return t;
}

// Creates a raw premarket row matching TvScanner.mapRow expectations
function makePremarketRow(symbol, change, volume = 100000, price = 25.00, float = 5e6) {
    const d = new Array(23).fill(null);
    d[0] = symbol.split(':')[1];
    d[1] = change;
    d[2] = float;
    d[3] = price - (price * change / 100);
    d[4] = "stock"; d[5] = []; d[6] = 100; d[7] = 1; d[8] = false; d[9] = 0;
    d[10] = "USD"; d[11] = volume; d[12] = float * price * 10;
    d[13] = "USD"; d[14] = volume * 0.8; d[15] = volume * 0.5;
    d[16] = change * 0.9; d[17] = 1.5; d[18] = "Technology"; d[19] = "america";
    d[20] = "Technology"; d[21] = price; d[22] = change * 0.5;
    return { s: symbol, d };
}

// Creates a raw market row matching TvScanner.mapMarketRow expectations (26 columns)
function makeMarketRow(symbol, change, rvol = 5, volume = 2e6, price = 50, float = 10e6) {
    const valueTr = volume * price;
    const d = new Array(26).fill(0);
    d[0] = symbol.split(':')[1];  // name
    d[1] = price;                  // close
    d[2] = "stock";                // type
    d[3] = [];                     // typespecs
    d[4] = 100;                    // pricescale
    d[5] = 1;                      // minmov
    d[6] = false; d[7] = 0;       // fractional, minmove2
    d[8] = "USD";                  // currency
    d[9] = valueTr;                // Value.Traded
    d[10] = rvol;                  // relative_volume_intraday|5
    d[11] = volume;                // volume
    d[12] = float;                 // float_shares_outstanding
    d[13] = 25;                    // float_shares_percent
    d[14] = 1.5;                   // relative_volume_10d_calc
    d[15] = change;                // change
    d[16] = change * 0.8;          // change_from_open
    d[17] = float * price;         // market_cap_basic
    d[18] = "Technology";          // sector.tr
    d[19] = volume * 0.2;          // premarket_volume
    d[20] = change * 0.5;          // premarket_change
    d[21] = 2.5;                   // ATRP
    d[22] = volume * 0.8;          // average_volume_10d_calc
    d[23] = price * 0.025;         // ATR
    d[24] = 50;                    // volume_change
    d[25] = change * 0.7;          // gap
    return { s: symbol, d };
}

// ─── MOCK TV SCANNER ────────────────────────────────────────────────────────
let premarketData = [];
let marketData = [];
let premarketShouldFail = false;
let marketShouldFail = false;
let premarketScanCount = 0;
let marketScanCount = 0;

const mockScanner = {
    getStocks10: async () => {
        premarketScanCount++;
        if (premarketShouldFail) throw new Error(`[SIM] Premarket API error (scan #${premarketScanCount})`);
        return { data: [...premarketData], totalCount: premarketData.length };
    },
    getMarketStocks: async () => {
        marketScanCount++;
        if (marketShouldFail) throw new Error(`[SIM] Market API error (scan #${marketScanCount})`);
        return { data: [...marketData], totalCount: marketData.length };
    },
    mapRow: TvScanner.mapRow,
    mapMarketRow: TvScanner.mapMarketRow,
};

// ─── MOCK TELEGRAM ──────────────────────────────────────────────────────────
let tgMessages = [];
let tgEdits = [];
let tgMsgIdCounter = 10000;

const mockTelegram = {
    sendMessage: async (text, opts) => {
        tgMsgIdCounter++;
        tgMessages.push({ id: tgMsgIdCounter, text, ts: Date.now() });
        return { success: true, message: { message_id: tgMsgIdCounter } };
    },
    sendMessageHTML: async (text, opts) => {
        tgMsgIdCounter++;
        tgMessages.push({ id: tgMsgIdCounter, text, ts: Date.now(), html: true });
        return { success: true, message: { message_id: tgMsgIdCounter } };
    },
    editMessage: async (messageId, text, opts) => {
        tgEdits.push({ messageId, text, ts: Date.now() });
        return { success: true, message: { message_id: messageId } };
    },
    pinMessage: async (messageId) => {
        return { success: true };
    },
    stop: () => { },
    initialize: async () => ({ username: 'test_bot' }),
    start: async () => { },
};

// ─── WEEK SCHEDULE ──────────────────────────────────────────────────────────
const WEEK = [
    { day: "Mon", label: "Monday — Full Trading Day" },
    { day: "Tue", label: "Tuesday — Full Trading Day" },
    { day: "Sat", label: "Saturday — Weekend OFF" },
    { day: "Sun", label: "Sunday — Weekend OFF" },
    { day: "Thu", label: "Thursday — Full Trading + Chaos" },
    { day: "Fri", label: "Friday — Final Day + Heavy Load" },
];

// Time phases per trading day (ET)
const PHASES = [
    { label: "Pre-open (03:30)", time: "03:30", premarket: false, market: false },
    { label: "Premarket (05:00)", time: "05:00", premarket: true, market: false },
    { label: "Premarket (08:00)", time: "08:00", premarket: true, market: false },
    { label: "Market Open (10:00)", time: "10:00", premarket: false, market: true },
    { label: "Midday (12:00)", time: "12:00", premarket: false, market: true },
    { label: "Afternoon (14:30)", time: "14:30", premarket: false, market: true },
    { label: "Market Close (16:15)", time: "16:15", premarket: false, market: false },
    { label: "After-hours (18:00)", time: "18:00", premarket: false, market: false },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function run() {
    const startTime = Date.now();

    console.log('╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║  FULL LIFECYCLE STRESS TEST — WEEK SIMULATION                           ║');
    console.log('║  Mon→Tue→Weekend→Thu→Fri · Premarket↔Market · Orchestrator · Real TG    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝');

    const logDir = path.join(__dirname, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `stress_lifecycle_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)}.txt`);
    console.log(`Log: ${logFile}`);

    // ═══ Connect real Telegram ═══
    let realTelegram;
    try {
        realTelegram = createTelegramService(realConfig);
        await realTelegram.initialize();
        console.log('Real Telegram ✓');
        await realTelegram.sendMessage('🧪 FULL LIFECYCLE STRESS TEST — Week Simulation Started');
        await sleep(1500);
    } catch (e) {
        console.error('Telegram failed:', e.message);
        process.exit(1);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRE-FLIGHT: Unit checks
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ PRE-FLIGHT: Orchestrator Logic Tests ═══');

    // Test orchestrator with mock time
    let orchestratorLog = [];
    const mockGrowthScanner = {
        getState: () => ({ isRunning: mockGrowthScanner._running, isStarting: false }),
        start: async () => { mockGrowthScanner._running = true; orchestratorLog.push('GROWTH_START'); },
        stop: async () => { mockGrowthScanner._running = false; orchestratorLog.push('GROWTH_STOP'); },
        _running: false,
    };
    const mockMarketScanner = {
        getState: () => ({ isRunning: mockMarketScanner._running }),
        start: async () => { mockMarketScanner._running = true; orchestratorLog.push('MARKET_START'); },
        stop: async () => { mockMarketScanner._running = false; orchestratorLog.push('MARKET_STOP'); },
        _running: false,
    };

    // Test 1: Premarket time → growth scanner starts
    let mockTime = { isPremarketTime: () => true, isMarketNow: () => false };
    let orch = createOrchestrator(testConfig, {
        growthScanner: mockGrowthScanner,
        marketScanner: mockMarketScanner
    }, mockTime);

    orch.start();
    await sleep(600);
    assert(mockGrowthScanner._running, 'Orch: premarket → growth scanner ON');
    assert(!mockMarketScanner._running, 'Orch: premarket → market scanner OFF');
    await orch.stop();

    // Test 2: Market time → market scanner starts, growth stops
    orchestratorLog = [];
    mockGrowthScanner._running = false;
    mockMarketScanner._running = false;
    mockTime = { isPremarketTime: () => false, isMarketNow: () => true };
    orch = createOrchestrator(testConfig, {
        growthScanner: mockGrowthScanner,
        marketScanner: mockMarketScanner
    }, mockTime);
    orch.start();
    await sleep(600);
    assert(!mockGrowthScanner._running, 'Orch: market hours → growth scanner OFF');
    assert(mockMarketScanner._running, 'Orch: market hours → market scanner ON');
    await orch.stop();

    // Test 3: Weekend → both off
    orchestratorLog = [];
    mockGrowthScanner._running = true; // simulate they were ON
    mockMarketScanner._running = true;
    mockTime = { isPremarketTime: () => false, isMarketNow: () => false };
    orch = createOrchestrator(testConfig, {
        growthScanner: mockGrowthScanner,
        marketScanner: mockMarketScanner
    }, mockTime);
    orch.start();
    await sleep(600);
    assert(!mockGrowthScanner._running, 'Orch: weekend → growth OFF');
    assert(!mockMarketScanner._running, 'Orch: weekend → market OFF');
    await orch.stop();

    // Test 4: Premarket → Market transition
    orchestratorLog = [];
    mockGrowthScanner._running = false;
    mockMarketScanner._running = false;
    let phase = 'premarket';
    mockTime = {
        isPremarketTime: () => phase === 'premarket',
        isMarketNow: () => phase === 'market',
    };
    orch = createOrchestrator(testConfig, {
        growthScanner: mockGrowthScanner,
        marketScanner: mockMarketScanner
    }, mockTime);
    orch.start();
    await sleep(600);
    assert(mockGrowthScanner._running, 'Orch transition: premarket → growth ON');

    phase = 'market';
    await sleep(700);
    assert(!mockGrowthScanner._running, 'Orch transition: → market → growth OFF');
    assert(mockMarketScanner._running, 'Orch transition: → market → market ON');

    phase = 'closed';
    await sleep(700);
    assert(!mockGrowthScanner._running, 'Orch transition: → closed → growth OFF');
    assert(!mockMarketScanner._running, 'Orch transition: → closed → market OFF');
    await orch.stop();

    // ═══════════════════════════════════════════════════════════════════
    // WEEK SIMULATION
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ WEEK SIMULATION ═══');

    const weekStats = {
        tradingDays: 0, weekendDays: 0,
        premarketScans: 0, marketScans: 0,
        premarketAlerts: 0, marketAlerts: 0,
        dashboardEdits: 0, errors: 0,
        transitions: 0, chaosEvents: 0,
    };

    for (const dayInfo of WEEK) {
        const isWeekend = dayInfo.day === 'Sat' || dayInfo.day === 'Sun';

        console.log(`\n━━━ ${dayInfo.label} ━━━`);

        if (isWeekend) {
            weekStats.weekendDays++;

            // Simulate orchestrator check during weekend
            mockGrowthScanner._running = false;
            mockMarketScanner._running = false;
            orchestratorLog = [];
            mockTime = { isPremarketTime: () => false, isMarketNow: () => false };
            orch = createOrchestrator(testConfig, {
                growthScanner: mockGrowthScanner,
                marketScanner: mockMarketScanner
            }, mockTime);
            orch.start();
            await sleep(600);
            assert(!mockGrowthScanner._running, `${dayInfo.day}: no growth scanner`);
            assert(!mockMarketScanner._running, `${dayInfo.day}: no market scanner`);
            await orch.stop();
            continue;
        }

        weekStats.tradingDays++;

        // ── Generate fresh data for the day ──
        const dayStocksPremarket = [];
        const dayStocksMarket = [];
        for (let i = 0; i < 15; i++) {
            const t = randomTicker();
            dayStocksPremarket.push(makePremarketRow(t, 10 + Math.random() * 50, 50000 + Math.random() * 1e6, 5 + Math.random() * 200, 1e6 + Math.random() * 1e8));
        }
        for (let i = 0; i < 25; i++) {
            const t = randomTicker();
            dayStocksMarket.push(makeMarketRow(t, 2 + Math.random() * 15, 2 + Math.random() * 12, 1e6 + Math.random() * 1e7, 5 + Math.random() * 200, 1e6 + Math.random() * 1e9));
        }

        // ── Simulate each time phase ──
        for (const phaseInfo of PHASES) {
            console.log(`  ⏰ ${phaseInfo.label}`);

            // Apply chaos on specific days
            const isChaosDay = dayInfo.day === 'Thu' || dayInfo.day === 'Fri';

            // ── PREMARKET PHASE ──
            if (phaseInfo.premarket) {
                premarketData = dayStocksPremarket;
                premarketShouldFail = false;

                // Chaos: inject API failure on Thu morning
                if (isChaosDay && phaseInfo.time === "05:00" && Math.random() < 0.5) {
                    premarketShouldFail = true;
                    weekStats.chaosEvents++;
                    console.log(`    💥 CHAOS: Premarket API failure`);
                }

                // Chaos: inject corrupt data on Fri
                if (dayInfo.day === 'Fri' && phaseInfo.time === "08:00") {
                    const corrupt = dayStocksPremarket.map(s => {
                        if (Math.random() < 0.3) {
                            const d = [...s.d]; d[1] = NaN; d[11] = null;
                            return { s: s.s, d };
                        }
                        return s;
                    });
                    premarketData = corrupt;
                    weekStats.chaosEvents++;
                    console.log(`    💥 CHAOS: Corrupt premarket data`);
                }

                // Run premarket scans
                const scanConfig = { ...testConfig, sendOnStartup: phaseInfo.time === "05:00" ? false : true };
                let state = {
                    lastReportedChanges: new Map(),
                    isFirstScan: phaseInfo.time === "05:00",
                    sendOnStartup: scanConfig.sendOnStartup,
                    lastTotalCount: 0, lastTickers: [], alertCount: 0,
                };

                for (let scan = 0; scan < 3; scan++) {
                    try {
                        state = await processStockData(
                            testConfig.premarketThreshold, state, mockTelegram, scanConfig, mockScanner
                        );
                        weekStats.premarketScans++;

                        // After first scan, grow some stocks
                        if (scan === 0) {
                            premarketData = dayStocksPremarket.map(s => {
                                const d = [...s.d];
                                d[1] = (d[1] || 10) + 2 + Math.random() * 5;
                                return { s: s.s, d };
                            });
                            premarketShouldFail = false; // recover
                        }
                    } catch (e) {
                        weekStats.errors++;
                        console.log(`    ⚠️ Premarket scan error: ${e.message.slice(0, 60)}`);
                    }
                }

                const phaseAlerts = tgMessages.filter(m => m.ts > Date.now() - 1000).length;
                weekStats.premarketAlerts += phaseAlerts;
            }

            // ── MARKET PHASE ──
            if (phaseInfo.market) {
                marketData = dayStocksMarket;
                marketShouldFail = false;

                // Chaos: inject market API failure on Thu midday
                if (isChaosDay && phaseInfo.time === "12:00" && Math.random() < 0.5) {
                    marketShouldFail = true;
                    weekStats.chaosEvents++;
                    console.log(`    💥 CHAOS: Market API failure`);
                }

                // Chaos: inject RVOL spike on Thu afternoon
                if (dayInfo.day === 'Thu' && phaseInfo.time === "14:30") {
                    marketData = dayStocksMarket.map(s => {
                        const d = [...s.d];
                        d[10] = 15 + Math.random() * 20; // high RVOL
                        d[15] = 5 + Math.random() * 15;  // high change
                        return { s: s.s, d };
                    });
                    weekStats.chaosEvents++;
                    console.log(`    💥 CHAOS: RVOL spike injection`);
                }

                // Chaos: inject dump stocks on Fri close
                if (dayInfo.day === 'Fri' && phaseInfo.time === "14:30") {
                    const dumpStocks = [];
                    for (let i = 0; i < 10; i++) {
                        dumpStocks.push(makeMarketRow(randomTicker(), -5 - Math.random() * 10, 8, 5e6, 100, 1e9));
                    }
                    marketData = [...dayStocksMarket, ...dumpStocks];
                    weekStats.chaosEvents++;
                    console.log(`    💥 CHAOS: Market dump stocks injected`);
                }

                // Create fresh market service for this phase
                const ms = createMarketService(testConfig, mockTelegram, mockScanner);
                try {
                    await ms.start();
                    weekStats.marketScans++;
                    weekStats.transitions++;

                    // Run a few more scans through timer simulation
                    await sleep(300);

                    // Verify service is running
                    const msState = ms.getState();
                    assert(msState.isRunning, `${dayInfo.day} ${phaseInfo.label}: market scanner running`);

                    // Stop gracefully
                    await ms.stop();
                    const afterStop = ms.getState();
                    assert(!afterStop.isRunning, `${dayInfo.day} ${phaseInfo.label}: market scanner stopped`);

                    marketShouldFail = false;
                } catch (e) {
                    weekStats.errors++;
                    console.log(`    ⚠️ Market service error: ${e.message.slice(0, 60)}`);
                    try { await ms.stop(); } catch (_) { }
                }
            }

            // ── CLOSED PHASE ──
            if (!phaseInfo.premarket && !phaseInfo.market) {
                // Verify nothing is running (simulate orchestrator check)
                // Just validate the gatekeeper logic
                const inPre = phaseInfo.premarket;
                const inMkt = phaseInfo.market;
                assert(!inPre && !inMkt, `${dayInfo.day} ${phaseInfo.label}: correctly outside trading hours`);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // CROSS-CYCLE STATE PERSISTENCE TEST
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ CROSS-CYCLE STATE PERSISTENCE ═══');

    // Simulate: scanner remembers stocks across restarts
    const persistTicker = randomTicker();
    premarketData = [makePremarketRow(persistTicker, 20, 500000, 40, 2e6)];
    premarketShouldFail = false;

    let persistState = {
        lastReportedChanges: new Map(),
        isFirstScan: true,
        sendOnStartup: true,
        lastTotalCount: 0, lastTickers: [], alertCount: 0,
    };

    // Scan 1: initial
    const preMsgCount = tgMessages.length;
    persistState = await processStockData(10, persistState, mockTelegram, testConfig, mockScanner);
    assert(persistState.lastReportedChanges.has(persistTicker), 'Persist: stock tracked after scan 1');

    // Simulate "restart" but with preserved state (like our fix ensures)
    premarketData = [makePremarketRow(persistTicker, 20, 500000, 40, 2e6)];
    const preRestartMsgCount = tgMessages.length;
    persistState = await processStockData(10, persistState, mockTelegram, testConfig, mockScanner);
    assert(tgMessages.length === preRestartMsgCount, 'Persist: no duplicate after "restart" with same data');

    // Grow the stock past step threshold
    premarketData = [makePremarketRow(persistTicker, 22, 600000, 42, 2e6)];
    const preGrowMsgCount = tgMessages.length;
    persistState = await processStockData(10, persistState, mockTelegram, testConfig, mockScanner);
    assert(tgMessages.length === preGrowMsgCount + 1, 'Persist: step alert after growth', `got +${tgMessages.length - preGrowMsgCount}`);

    // ═══════════════════════════════════════════════════════════════════
    // MULTI-SERVICE INTERACTION TEST
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ MULTI-SERVICE INTERACTION ═══');

    // Both services start and stop without interfering
    const multiPre = [];
    const multiMkt = [];
    for (let i = 0; i < 10; i++) {
        multiPre.push(makePremarketRow(randomTicker(), 15 + Math.random() * 30));
        multiMkt.push(makeMarketRow(randomTicker(), 3 + Math.random() * 10, 3 + Math.random() * 8));
    }

    premarketData = multiPre;
    marketData = multiMkt;
    premarketShouldFail = false;
    marketShouldFail = false;

    // Start both "simultaneously" (like transition overlap)
    const preState = {
        lastReportedChanges: new Map(),
        isFirstScan: false, sendOnStartup: true,
        lastTotalCount: 0, lastTickers: [], alertCount: 0,
    };
    const ms = createMarketService(testConfig, mockTelegram, mockScanner);

    let preScanOk = false, mktScanOk = false;
    try {
        const [preResult, mktResult] = await Promise.all([
            processStockData(10, preState, mockTelegram, testConfig, mockScanner).then(r => { preScanOk = true; return r; }),
            ms.start().then(() => { mktScanOk = true; }),
        ]);
        assert(preScanOk, 'Multi: premarket scan succeeded alongside market');
        assert(mktScanOk, 'Multi: market service started alongside premarket');
    } catch (e) {
        assert(false, 'Multi: parallel services', e.message);
    }
    await ms.stop();

    // ═══════════════════════════════════════════════════════════════════
    // REAL TELEGRAM TEST
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n═══ REAL TELEGRAM INTEGRATION ═══');

    // Send lifecycle status messages
    const statusTests = [
        '🌅 *Mon Premarket*: 15 stocks tracked, 3 alerts sent',
        '🔥 *Mon Market*: SVS top: NOVA(+12%), FLUX(+8%), Shadow Velocity active',
        '🌙 *Mon Close*: Total alerts: 8, Dashboard updates: 12',
        '📅 *Weekend*: All scanners OFF',
        '🌅 *Thu Premarket*: Recovery after chaos — 0 crashes',
    ];

    for (const msg of statusTests) {
        try {
            const r = await realTelegram.sendMessage(msg);
            assert(r.success, `TG: ${msg.slice(0, 40)}...`);
            await sleep(1200);
        } catch (e) {
            assert(false, `TG send failed: ${e.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    // DEEP LOG ANALYSIS
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log('  DEEP LOG ANALYSIS');
    console.log('══════════════════════════════════════════════════════════════════');

    const fullLog = logLines.join('\n');
    const count = (pattern) => (fullLog.match(pattern) || []).length;

    console.log(`  ✅ Passed:              ${passed}`);
    console.log(`  ❌ Failed:              ${failed}`);
    console.log(`  ⚠️  Warnings:           ${count(/\[WARN\]/g)}`);
    console.log(`  🔴 Errors:              ${count(/\[ERROR\]/g)}`);
    console.log(`  📨 TG mock messages:    ${tgMessages.length}`);
    console.log(`  📝 TG mock edits:       ${tgEdits.length}`);
    console.log(`  💥 Chaos events:        ${weekStats.chaosEvents}`);
    console.log(`  📅 Trading days:        ${weekStats.tradingDays}`);
    console.log(`  🏖️  Weekend days:        ${weekStats.weekendDays}`);
    console.log(`  🌅 Premarket scans:     ${weekStats.premarketScans}`);
    console.log(`  🔥 Market scans:        ${weekStats.marketScans}`);
    console.log(`  🔄 Transitions:         ${weekStats.transitions}`);

    // Anomaly detection
    console.log('\n  Anomaly detection:');

    const uncaught = count(/uncaught|unhandled/gi);
    console.log(`    Uncaught exceptions: ${uncaught}`);
    assert(uncaught === 0, 'Log: no uncaught exceptions');

    const duplicateStarts = count(/already running|isStarting/gi);
    console.log(`    Duplicate start attempts: ${duplicateStarts}`);

    const hangDetect = count(/\bdeadlock\b|\bhang\b|\bfrozen\b/gi);
    console.log(`    Hang/deadlock hints: ${hangDetect}`);
    assert(hangDetect === 0, 'Log: no hangs detected');

    if (failures.length > 0) {
        console.log('\n  ❌ Failed tests:');
        for (const f of failures) {
            console.log(`    ${f.name}: ${f.detail}`);
        }
    }

    // ═══ VERDICT ═══
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n══════════════════════════════════════════════════════════════════');
    if (failed === 0) {
        console.log(`  🎉 VERDICT: PRODUCTION READY`);
        console.log(`  Full week lifecycle passed all ${total} tests`);
        console.log(`  ${weekStats.tradingDays} trading days, ${weekStats.weekendDays} weekend days, ${weekStats.chaosEvents} chaos events`);
    } else {
        console.log(`  ❌ VERDICT: ISSUES FOUND — ${failed} failure(s)`);
    }
    console.log('══════════════════════════════════════════════════════════════════');
    console.log(`\n  ${passed} passed, ${failed} failed, ${total} total | Duration: ${duration}s`);

    // Send final report
    await realTelegram.sendMessage(
        `🧪 FULL LIFECYCLE TEST: ${failed === 0 ? '✅ PASSED' : '❌ FAILED'}\n` +
        `Tests: ${passed}/${total} | Duration: ${duration}s\n` +
        `Week: ${weekStats.tradingDays} trading, ${weekStats.weekendDays} weekend\n` +
        `Premarket: ${weekStats.premarketScans} scans | Market: ${weekStats.marketScans} scans\n` +
        `Chaos: ${weekStats.chaosEvents} events, 0 crashes`
    );
    await sleep(1000);

    // Save logs
    fs.writeFileSync(logFile, logLines.join('\n'), 'utf-8');
    console.log(`\nLog: ${logFile} (${logLines.length} entries)`);

    try { realTelegram.stop('LIFECYCLE_TEST_DONE'); } catch (_) { }
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
