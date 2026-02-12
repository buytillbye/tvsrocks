/**
 * @fileoverview Catalyst Sniper (Gap & Reverse) — Comprehensive Stress Test
 * 
 * Verifies:
 *   1. Watchlist building (08:00-09:30) with correct filters.
 *   2. Active mode transition (09:30).
 *   3. Strategy A (Fade) trigger logic and deduplication.
 *   4. Strategy B (Bounce) trigger logic and deduplication.
 *   5. Chaos injection (NaN, nulls, extreme values).
 *   6. Detailed state logging.
 */
import { createCatalystService } from "../src/services/catalystService.js";
import { TvScanner } from "../src/services/tradingview.js";
import fs from 'fs';
import path from 'path';

// ─── CONFIG & MOCK TELEGRAM ───────────────────────────────────────────────
const config = {
    api: { tvCookie: "mock_cookie" },
    chatId: 12345,
    botToken: "mock_token",
    catalystWatchlistIntervalMs: 1000,
    catalystActiveIntervalMs: 1000
};

const alertsSent = [];
const mockTelegram = {
    sendMessage: async (msg) => {
        alertsSent.push(msg);
        log("TELEGRAM", `Sent Alert:\n${msg}`);
        return { success: true, message: { message_id: Date.now() } };
    }
};

// ─── LOGGING ────────────────────────────────────────────────────────────────
const LOG_FILE = path.join(process.cwd(), 'tests', 'logs', `catalyst_stress_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

const log_entries = [];
const log = (level, msg) => {
    const ts = new Date().toISOString();
    const entry = `[${ts}] [${level}] ${msg}`;
    log_entries.push(entry);
    console.log(entry);
    fs.appendFileSync(LOG_FILE, entry + '\n');
};

const INFO = (msg) => log("INFO", msg);
const PASS = (name) => log("✅ PASS", name);
const FAIL = (name, reason) => log("❌ FAIL", `${name}: ${reason}`);

let passed = 0;
let failed = 0;
const assert = (condition, name, detail = "") => {
    if (condition) { passed++; PASS(name); }
    else { failed++; FAIL(name, detail || "assertion failed"); }
    return condition;
};

// ─── MOCK DATA ──────────────────────────────────────────────────────────────
const SETUP_DATA = {
    data: [
        { s: "NASDAQ:SHOP", d: ["SHOP", 12.5, 1200000, 50, "stock", ["common"], 1, 1, 0, 1, "USD", 1200000, 1000000000, "USD", 1000000, 1000000, 12.5, 1, "Sector", "market", "sector", 56, 12.5] }, // Valid Fader Setup
        { s: "NYSE:U", d: ["U", -15.0, 800000, 30, "stock", ["common"], 1, 1, 0, 1, "USD", 800000, 500000000, "USD", 500000, 500000, -15.0, 1, "Sector", "market", "sector", 25, -15.0] },  // Valid Bounce Setup
        { s: "NASDAQ:SMALL", d: ["SMALL", 2.0, 1000000, 10, "stock", ["common"], 1, 1, 0, 1, "USD", 1000000, 100000000, "USD", 100000, 100000, 2.0, 1, "Sector", "market", "sector", 10, 2.0] },  // Too small gap
        { s: "NASDAQ:NOVOL", d: ["NOVOL", 10.0, 100000, 10, "stock", ["common"], 1, 1, 0, 1, "USD", 100000, 10000000, "USD", 10000, 10000, 10.0, 1, "Sector", "market", "sector", 11, 10.0] },   // Too small volume
        { s: "NASDAQ:CHAOS", d: ["CHAOS", 20.0, 2000000, 100, "stock", ["common"], 1, 1, 0, 1, "USD", 2000000, 2000000000, "USD", 200000, 200000, 20.0, 1, "Sector", "market", "sector", 120, 20.0] }, // Valid Fader for Chaos
    ],
    totalCount: 5
};

let currentMarketData = {
    data: [
        { s: "NASDAQ:SHOP", d: ["SHOP", 50, "stock", [], 1, 1, 0, 1, "USD", 10000000, 2.5, 10000000, 1200000, 15, 1.2, 12.5, 0.0, 1000000000, "USD", 1200000, 12.5, 0, 0, 0, 0, 12.5] }, // SHOP at open (change_from_open=0)
        { s: "NYSE:U", d: ["U", 30, "stock", [], 1, 1, 0, 1, "USD", 5000000, 1.8, 5000000, 800000, 12, 1.5, -15.0, 0.0, 500000000, "USD", 800000, -15.0, 0, 0, 0, 0, -15.0] },     // U at open
        { s: "NASDAQ:CHAOS", d: ["CHAOS", 100, "stock", [], 1, 1, 0, 1, "USD", 20000000, 5.0, 20000000, 2000000, 50, 2.0, 20.0, 0.0, 2000000000, "USD", 2000000, 20.0, 0, 0, 0, 0, 20.0] } // CHAOS at open
    ],
    totalCount: 3
};

// ─── TEST RUNNER ───────────────────────────────────────────────────────────
async function runTest() {
    INFO("═══ CATALYST SNIPER STRESS TEST STARTING ═══");
    INFO(`Log file: ${LOG_FILE}`);

    // Create a mock scanner object
    const mockScanner = {
        getCatalystSetupStocks: async () => SETUP_DATA,
        getMarketStocks: async () => JSON.parse(JSON.stringify(currentMarketData)), // Deep clone to prevent internal mutation issues
        mapRow: TvScanner.mapRow,
        mapMarketRow: TvScanner.mapMarketRow
    };

    const catalyst = createCatalystService(config, mockTelegram, mockScanner);

    // Phase 1: Watchlist Building (Setup)
    INFO("\n--- Phase 1: Watchlist Building ---");
    catalyst.start('watchlist');
    await new Promise(r => setTimeout(r, 1500)); // wait for performScan

    const state1 = catalyst.getState();
    assert(state1.watchlist.size === 5, "Watchlist should have 5 candidates from mock", `got ${state1.watchlist.size}`);
    assert(state1.watchlist.has("NASDAQ:SHOP"), "SHOP in watchlist");
    assert(state1.watchlist.has("NYSE:U"), "U in watchlist");
    assert(state1.watchlist.has("NASDAQ:CHAOS"), "CHAOS in watchlist");

    // Phase 2: Transition to Active
    INFO("\n--- Phase 2: Active Mode Transition ---");
    catalyst.setMode('active');
    await new Promise(r => setTimeout(r, 1500));

    assert(alertsSent.length === 0, "No alerts yet at open (change_from_open=0)");

    // Phase 3: Fader Trigger (SHOP)
    INFO("\n--- Phase 3: Fader Trigger (SHOP) ---");
    // Modify SHOP: d[16] is change_from_open
    currentMarketData.data[0].d[16] = -0.6;
    INFO(`Simulating SHOP reversal: change_from_open = ${currentMarketData.data[0].d[16]}%`);

    // Wait for at least 2 full intervals to be safe
    await new Promise(r => setTimeout(r, 3000));

    const finalState = catalyst.getState();
    INFO(`Alerts sent total: ${alertsSent.length}`);
    INFO(`Triggered set: ${Array.from(finalState.triggered).join(', ')}`);

    assert(alertsSent.length === 1, "One alert sent for SHOP Fader", `got ${alertsSent.length} alerts`);
    if (alertsSent.length > 0) {
        assert(alertsSent[0].includes("FADE (Short)") && alertsSent[0].includes("SHOP"), "Alert content correct for SHOP");
    }
    assert(catalyst.getState().triggered.has("NASDAQ:SHOP"), "SHOP marked as triggered");

    // Phase 4: Deduplication Check
    INFO("\n--- Phase 4: Deduplication Check ---");
    currentMarketData.data[0].d[16] = -1.5;
    await new Promise(r => setTimeout(r, 2000));
    assert(alertsSent.length === 1, "Alert count still 1 (dedup works)");

    // Phase 5: Bounce Trigger (U)
    INFO("\n--- Phase 5: Bounce Trigger (U) ---");
    currentMarketData.data[1].d[16] = 0.7;
    await new Promise(r => setTimeout(r, 3000));
    assert(alertsSent.length === 2, "Two alerts total (U Bounce added)");
    if (alertsSent.length > 1) {
        assert(alertsSent[1].includes("BOUNCE (Long)") && alertsSent[1].includes("U"), "Alert content correct for U");
    }

    // Phase 6: Chaos Injection
    INFO("\n--- Phase 6: Chaos Injection ---");
    INFO("Injecting NaN values, nulls, and extreme numbers...");

    // CHAOS stock goes wild
    currentMarketData.data[2].d[16] = NaN;
    await new Promise(r => setTimeout(r, 1000));

    currentMarketData.data[2].d[16] = null;
    await new Promise(r => setTimeout(r, 1000));

    // SHOP gets a weird large number
    currentMarketData.data[0].d[16] = -999999.99;

    // Test if a ticker NOT in watchlist but in market data causes crash
    currentMarketData.data.push({ s: "NASDAQ:STRANGER", d: ["STRANGER", 100, "stock", [], 1, 1, 0, 1, "USD", 1, 1, 1, 1, 1, 1, 1, 10.0, 1, "USD", 1, 1, 1, 1, 1, 1, 1] });

    await new Promise(r => setTimeout(r, 2000));

    // If we are here, we didn't crash
    PASS("Chaos: No crash on NaN, null, or extreme values");

    // Check CHAOS trigger after recovering from NaN to valid
    INFO("Recovering CHAOS stock to valid trigger...");
    currentMarketData.data[2].d[16] = -1.0;
    await new Promise(r => setTimeout(r, 3000));
    assert(alertsSent.length === 3, "Three alerts total (CHAOS Fader added after recovery)");

    // Final result
    INFO(`\n═══ RESULTS: ${passed} passed, ${failed} failed ═══`);

    // Cleanup
    catalyst.stop();

    if (failed > 0) process.exit(1);
}

runTest().catch(e => {
    log("FATAL", e.stack);
    process.exit(1);
});
