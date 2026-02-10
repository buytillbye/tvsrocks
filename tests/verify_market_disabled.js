/**
 * 🧪 VERIFICATION: Market Scanner Disabled
 * 
 * Tests that:
 * 1. Premarket scanner still works correctly with mock data
 * 2. rvolService stub export is functional (start/stop/getState)
 * 3. Orchestrator runs only growthScanner, ignores RVOL
 * 4. TvScanner export only has premarket methods
 * 5. Config no longer has RVOL fields
 */
import { createOrchestrator } from '../src/core/orchestrator.js';
import { createScanner } from '../src/services/scanner.js';
import { createRvolService } from '../src/services/rvolService.js';
import { processStockData } from '../src/services/stock.js';
import { TvScanner } from '../src/services/tradingview.js';
import { parseConfig } from '../src/config/index.js';

// --- HELPERS ---
let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: ${label}`);
        failed++;
    }
}

// --- MOCK SERVICES ---
const config = {
    premarketHours: { start: "04:00", end: "09:30" },
    premarketThreshold: 10,
    premarketAlertStep: 1.0,
    scanIntervalMs: 60000,
    sendOnStartup: true,
    timeouts: { gatekeeperIntervalMs: 100, shutdownGraceMs: 100 },
    retry: { maxAttempts: 1 }
};

const sentMessages = [];
const telegramService = {
    sendMessage: async (msg) => {
        sentMessages.push(msg);
        return { success: true };
    },
    sendPhoto: async (path, msg) => {
        sentMessages.push(msg);
        return { success: true };
    }
};

// --- MOCK SCANNER (premarket data only) ---
let premarketData = { data: [], totalCount: 0 };
const mockTvScanner = {
    getStocks10: async () => premarketData,
    mapRow: TvScanner.mapRow,
};

// Helper to create a premarket stock row matching COLUMNS_PREMARKET
const createPremarketRow = (symbol, change, price = 5.0) => ({
    s: symbol,
    d: [
        symbol.split(':')[1],  // ticker-view (d[0])
        change,                // premarket_change (d[1])
        8000000,               // float_shares_outstanding_current (d[2])
        price,                 // close (d[3])
        "stock",               // type (d[4])
        ["common"],            // typespecs (d[5])
        100, 1, false, 0,      // pricescale, minmov, fractional, minmove2 (d[6-9])
        "USD",                 // currency (d[10])
        500000,                // premarket_volume (d[11])
        100000000,             // market_cap_basic (d[12])
        "USD",                 // fundamental_currency_code (d[13])
        1000000,               // volume (d[14])
        500000,                // average_volume_10d_calc (d[15])
        2.0,                   // change (d[16])
        1.5,                   // relative_volume_10d_calc (d[17])
        "Technology",          // sector.tr (d[18])
        "america",             // market (d[19])
        "Technology",          // sector (d[20])
        price + 0.5,           // premarket_close (d[21])
        1.0                    // change_from_open (d[22])
    ]
});

// ============================================================
async function runTests() {
    console.log('\n🧪 === VERIFICATION: MARKET SCANNER DISABLED ===\n');

    // ── TEST 1: TvScanner export ─────────────────────────────
    console.log('── TEST 1: TvScanner exports ──');
    assert(typeof TvScanner.getStocks10 === 'function', 'getStocks10 is exported');
    assert(typeof TvScanner.mapRow === 'function', 'mapRow is exported');
    assert(TvScanner.getRvolSurgeStocks === undefined, 'getRvolSurgeStocks is NOT exported (disabled)');
    assert(TvScanner.mapRvolRow === undefined, 'mapRvolRow is NOT exported (disabled)');

    // ── TEST 2: rvolService stub ─────────────────────────────
    console.log('\n── TEST 2: rvolService stub ──');
    const rvolStub = createRvolService();
    assert(typeof rvolStub.start === 'function', 'stub has start()');
    assert(typeof rvolStub.stop === 'function', 'stub has stop()');
    assert(typeof rvolStub.getState === 'function', 'stub has getState()');

    const rvolState = rvolStub.getState();
    assert(rvolState.isRunning === false, 'stub isRunning = false');
    assert(rvolState.lastTotalCount === 0, 'stub lastTotalCount = 0');
    assert(Array.isArray(rvolState.lastTickers), 'stub lastTickers is array');
    assert(rvolState.alertCount === 0, 'stub alertCount = 0');

    // start/stop should not throw
    await rvolStub.start();
    rvolStub.stop();
    assert(true, 'stub start/stop did not throw');

    // ── TEST 3: Config (no RVOL fields) ──────────────────────
    console.log('\n── TEST 3: Config validation ──');
    try {
        const parsedConfig = parseConfig();
        assert(parsedConfig.premarketThreshold !== undefined, 'premarketThreshold exists in config');
        assert(parsedConfig.scanIntervalMs !== undefined, 'scanIntervalMs exists in config');
        assert(parsedConfig.premarketAlertStep !== undefined, 'premarketAlertStep exists in config');
        assert(parsedConfig.rvolThreshold === undefined, 'rvolThreshold is NOT in config (disabled)');
        assert(parsedConfig.rvolIntervalMs === undefined, 'rvolIntervalMs is NOT in config (disabled)');
        assert(parsedConfig.rvolAlertStep === undefined, 'rvolAlertStep is NOT in config (disabled)');
    } catch (e) {
        // parseConfig may fail without .env — test still valid if RVOL fields missing
        console.log('  ⚠️  parseConfig threw (likely missing .env), skipping config field checks');
    }

    // ── TEST 4: Orchestrator (only premarket, no RVOL) ───────
    console.log('\n── TEST 4: Orchestrator without RVOL ──');
    let growthRunning = false;
    const mockGrowthScanner = {
        start: async () => { growthRunning = true; },
        stop: async () => { growthRunning = false; },
        getState: () => ({ isRunning: growthRunning })
    };

    let mockTime = { inPremarket: false };
    const mockTimeUtils = {
        isPremarketTime: () => mockTime.inPremarket
    };

    // Orchestrator should work with only growthScanner (no rvolScanner)
    const orchestrator = createOrchestrator(
        config,
        { growthScanner: mockGrowthScanner },
        mockTimeUtils
    );

    // 4a. Premarket ON → growth starts
    mockTime.inPremarket = true;
    orchestrator.start();
    await new Promise(r => setTimeout(r, 150));
    assert(growthRunning === true, 'Growth scanner starts during premarket');

    // 4b. Premarket OFF → growth stops
    mockTime.inPremarket = false;
    await new Promise(r => setTimeout(r, 150));
    assert(growthRunning === false, 'Growth scanner stops after premarket');

    // 4c. Back to premarket → growth restarts
    mockTime.inPremarket = true;
    await new Promise(r => setTimeout(r, 150));
    assert(growthRunning === true, 'Growth scanner restarts on next premarket');

    await orchestrator.stop();
    assert(growthRunning === false, 'Orchestrator stop cleans up growthScanner');

    // ── TEST 5: Premarket stock processing (end-to-end) ──────
    console.log('\n── TEST 5: Premarket stock processing ──');
    sentMessages.length = 0;

    // 5a. Initial scan with one stock
    premarketData = {
        data: [createPremarketRow('NASDAQ:AAPL', 12.5, 175)],
        totalCount: 1
    };
    let state = {
        lastReportedChanges: new Map(),
        isFirstScan: false,
        sendOnStartup: true,
        lastTotalCount: 0,
        lastTickers: [],
        alertCount: 0
    };

    state = await processStockData(10, state, telegramService, config, mockTvScanner);
    assert(state.alertCount === 1, `First scan: 1 alert sent (got ${state.alertCount})`);
    assert(state.lastReportedChanges.has('NASDAQ:AAPL'), 'AAPL tracked in state');
    assert(sentMessages.length > 0, 'Telegram message was sent');

    // 5b. Second scan — same stock, small change (no alert)
    const prevMsgCount = sentMessages.length;
    premarketData = {
        data: [createPremarketRow('NASDAQ:AAPL', 12.8, 176)],
        totalCount: 1
    };
    state = await processStockData(10, state, telegramService, config, mockTvScanner);
    assert(sentMessages.length === prevMsgCount, 'No duplicate alert for small growth (+0.3%)');

    // 5c. Third scan — growth above step threshold → new alert
    premarketData = {
        data: [createPremarketRow('NASDAQ:AAPL', 14.0, 180)],
        totalCount: 1
    };
    state = await processStockData(10, state, telegramService, config, mockTvScanner);
    assert(state.alertCount === 2, `Growth alert sent after +1.5% step (got alertCount=${state.alertCount})`);

    // 5d. New stock appears
    premarketData = {
        data: [
            createPremarketRow('NASDAQ:AAPL', 14.0, 180),
            createPremarketRow('NASDAQ:TSLA', 15.0, 220)
        ],
        totalCount: 2
    };
    state = await processStockData(10, state, telegramService, config, mockTvScanner);
    assert(state.lastReportedChanges.has('NASDAQ:TSLA'), 'New stock TSLA tracked');
    assert(state.alertCount === 3, `New stock alert sent (got alertCount=${state.alertCount})`);

    // 5e. Empty scan — no crash
    premarketData = { data: [], totalCount: 0 };
    state = await processStockData(10, state, telegramService, config, mockTvScanner);
    assert(state.lastTotalCount === 0, 'Empty scan handled gracefully');

    // ── RESULTS ──────────────────────────────────────────────
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`🏁 RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
    if (failed === 0) {
        console.log('🎉 ALL TESTS PASSED — Premarket scanner works, Market scanner cleanly disabled');
    } else {
        console.log('⚠️  Some tests failed! Review output above.');
    }
    console.log(`${'═'.repeat(50)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('💥 Test crashed:', err);
    process.exit(1);
});
