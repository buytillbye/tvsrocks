/**
 * @fileoverview Shadow Velocity Scanner — Comprehensive Stress Test
 * 
 * Connects to REAL Telegram, uses MOCK scanner data, simulates all scenarios:
 *   1. Baseline scan  → dashboard + classification
 *   2. RVOL Spike     → PUMP alert trigger
 *   3. Price Dump     → DUMP alert trigger
 *   4. New Entrant    → NEW alert trigger
 *   5. Dead Zone      → no alerts, dashboard only
 *   6. Edge Cases     → null/undefined fields
 *   7. Massive Swing  → TOP-5 ranking stress
 *   8. Market close   → stop service cleanly
 * 
 * Usage: node tests/stress_test_market.js
 */
import { parseConfig, validateConfig } from "../src/config/index.js";
import { createTelegramService } from "../src/services/telegram.js";
import { createMarketService, calcSVS, calcHSS, formatDashboard } from "../src/services/marketService.js";
import { TvScanner } from "../src/services/tradingview.js";
import {
    BASELINE_RESPONSE,
    createRvolSpikeData,
    createPriceDumpData,
    createNewEntrantData,
    createDeadZoneData,
    createEdgeCaseData,
    createMassiveSwingData
} from "./fixtures/market_mock_data.js";

// ─── LOGGING ────────────────────────────────────────────────────────────────
const logs = [];
const log = (level, msg) => {
    const ts = new Date().toISOString();
    const entry = `[${ts}] [${level}] ${msg}`;
    logs.push(entry);
    console.log(entry);
};

const PASS = (name) => log("✅ PASS", name);
const FAIL = (name, reason) => log("❌ FAIL", `${name}: ${reason}`);
const INFO = (msg) => log("INFO", msg);

let passed = 0;
let failed = 0;
const assert = (condition, name, detail = "") => {
    if (condition) { passed++; PASS(name); }
    else { failed++; FAIL(name, detail || "assertion failed"); }
    return condition;
};

// ─── MOCK SCANNER ───────────────────────────────────────────────────────────
let currentMockData = BASELINE_RESPONSE;

const mockScanner = {
    getMarketStocks: async () => {
        return { data: currentMockData.data, totalCount: currentMockData.totalCount };
    },
    mapMarketRow: TvScanner.mapMarketRow
};

const setMockData = (data) => { currentMockData = data; };

// ─── HELPER: sleep ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── TEST PHASES ────────────────────────────────────────────────────────────

async function testPhase1_ScoringFormulas() {
    INFO("═══ PHASE 1: SVS / HSS Formula Unit Tests ═══");

    // Test SVS with NKTR:  change_from_open=18.77, rvol=13.57, value_traded=486928176
    const nktr = TvScanner.mapMarketRow(BASELINE_RESPONSE.data[1]);
    const svs = calcSVS(nktr);
    assert(svs !== null, "SVS: NKTR should pass gatekeeper (rvol=13.57, chg=18.77%, val=$487M, price=$56)");
    if (svs !== null) {
        const expected = 18.77 * 13.57 * Math.log10(486928176);
        assert(Math.abs(svs - expected) < 1, "SVS: NKTR score calculation correct", `got ${svs.toFixed(2)}, expected ~${expected.toFixed(2)}`);
        INFO(`  NKTR SVS = ${svs.toFixed(2)}`);
    }

    // Test SVS gatekeeper: KD has rvol=4.17 (< 5.0 threshold) → should be null
    const kd = TvScanner.mapMarketRow(BASELINE_RESPONSE.data[3]);
    const svsKd = calcSVS(kd);
    assert(svsKd === null, "SVS: KD should be filtered (rvol=4.17 < 5.0)");

    // Test SVS gatekeeper: OSCR has change_from_open = -4.59 (< 2.0) → null
    const oscr = TvScanner.mapMarketRow(BASELINE_RESPONSE.data[4]);
    const svsOscr = calcSVS(oscr);
    assert(svsOscr === null, "SVS: OSCR should be filtered (change=-4.59 < 2.0)");

    // Test HSS with GSHD: change_from_open=-12.25, value_traded=83386141
    const gshd = TvScanner.mapMarketRow(BASELINE_RESPONSE.data[16]);
    const hss = calcHSS(gshd);
    assert(hss !== null, "HSS: GSHD should pass gatekeeper (chg=-12.25%, val=$83M)");
    if (hss !== null) {
        const expected = Math.abs(-12.25) * Math.pow(Math.log10(83386141.12), 2);
        assert(Math.abs(hss - expected) < 1, "HSS: GSHD score calculation correct", `got ${hss.toFixed(2)}, expected ~${expected.toFixed(2)}`);
        INFO(`  GSHD HSS = ${hss.toFixed(2)}`);
    }

    // Test HSS gatekeeper: NKTR has change=+18.77% (> -2.0) → null
    const hssNktr = calcHSS(nktr);
    assert(hssNktr === null, "HSS: NKTR should be filtered (change=+18.77 > -2.0)");

    // Test HSS gatekeeper: MBOT has value_traded=43M (< $50M threshold) → null
    const mbot = TvScanner.mapMarketRow(BASELINE_RESPONSE.data[22]);
    const hssMbot = calcHSS(mbot);
    assert(hssMbot === null, "HSS: MBOT should be filtered (val=$43M < $50M)");

    // Test SVS with null fields
    const svsNull = calcSVS({ rvol_intraday_5m: null, change_from_open: 10, value_traded: 100000000, close: 5 });
    assert(svsNull === null, "SVS: null rvol → null score");

    const hssNull = calcHSS({ change_from_open: null, value_traded: 100000000 });
    assert(hssNull === null, "HSS: null change → null score");
}

async function testPhase2_DashboardFormatting() {
    INFO("═══ PHASE 2: Dashboard Formatting Tests ═══");

    // Map all stocks
    const stocks = BASELINE_RESPONSE.data.map(TvScanner.mapMarketRow);

    // Classify
    const alpha = stocks
        .map(s => { const svs = calcSVS(s); return svs ? { ...s, _svs: svs } : null; })
        .filter(Boolean)
        .sort((a, b) => b._svs - a._svs)
        .slice(0, 5);

    const bear = stocks
        .map(s => { const hss = calcHSS(s); return hss ? { ...s, _hss: hss } : null; })
        .filter(Boolean)
        .sort((a, b) => b._hss - a._hss)
        .slice(0, 5);

    INFO(`  Alpha Sprint: ${alpha.length} stocks (top SVS: ${alpha[0]?._svs.toFixed(0) || "N/A"})`);
    INFO(`  Inst. Bear:   ${bear.length} stocks (top HSS: ${bear[0]?._hss.toFixed(0) || "N/A"})`);

    assert(alpha.length > 0, "Classification: at least 1 alpha stock found");
    assert(alpha.length <= 5, "Classification: alpha stocks capped at 5");

    // Test formatting
    const prevStocks = new Map();
    const dash = formatDashboard(alpha, bear, prevStocks, new Date());
    assert(typeof dash === "string", "Dashboard: returns string");
    assert(dash.includes("SHADOW VELOCITY DASHBOARD"), "Dashboard: contains header");
    assert(dash.includes("ALPHA SPRINT"), "Dashboard: contains Alpha section");
    assert(dash.includes("INSTITUTIONAL BEAR"), "Dashboard: contains Bear section");
    assert(dash.includes("<code>"), "Dashboard: uses monospace HTML");

    // Log alpha stocks for manual review
    for (const s of alpha) {
        const ticker = s.symbol.split(":")[1];
        INFO(`  🚀 ${ticker}: SVS=${s._svs.toFixed(0)}, RVOL=${s.rvol_intraday_5m.toFixed(1)}, Chg=${s.change_from_open.toFixed(1)}%, Val=$${(s.value_traded / 1e6).toFixed(0)}M`);
    }
    for (const s of bear) {
        const ticker = s.symbol.split(":")[1];
        INFO(`  🐻 ${ticker}: HSS=${s._hss.toFixed(0)}, Chg=${s.change_from_open.toFixed(1)}%, Val=$${(s.value_traded / 1e6).toFixed(0)}M`);
    }
}

async function testPhase3_EdgeCases() {
    INFO("═══ PHASE 3: Edge Case Tests ═══");

    const edgeData = createEdgeCaseData(BASELINE_RESPONSE);
    const stocks = edgeData.data
        .filter(r => r.d !== undefined)
        .map(TvScanner.mapMarketRow);

    // Should not crash on null/undefined
    let crashed = false;
    try {
        for (const s of stocks) {
            calcSVS(s);
            calcHSS(s);
        }
    } catch (e) {
        crashed = true;
        FAIL("Edge: scoring should not throw on null fields", e.message);
    }
    if (!crashed) PASS("Edge: scoring handles null/undefined without crash");

    // Broken row (undefined d) should be filtered out
    const brokenRow = edgeData.data.find(r => r.d === undefined);
    assert(brokenRow !== undefined, "Edge: broken row exists in test data");

    // Penny stock should be filtered by SVS gatekeeper
    const pennyStock = TvScanner.mapMarketRow(edgeData.data[3]);
    const svsPenny = calcSVS(pennyStock);
    assert(svsPenny === null, "Edge: penny stock ($0.50) filtered by SVS gatekeeper");
}

async function testPhase4_DeadZone() {
    INFO("═══ PHASE 4: Dead Zone — No Stocks Should Qualify ═══");

    const deadData = createDeadZoneData(BASELINE_RESPONSE);
    const stocks = deadData.data.map(TvScanner.mapMarketRow);

    const alphaCount = stocks.filter(s => calcSVS(s) !== null).length;
    const bearCount = stocks.filter(s => calcHSS(s) !== null).length;

    assert(alphaCount === 0, "Dead Zone: zero alpha stocks (all below thresholds)", `got ${alphaCount}`);
    assert(bearCount === 0, "Dead Zone: zero bear stocks (all below thresholds)", `got ${bearCount}`);
}

async function testPhase5_MassiveSwing() {
    INFO("═══ PHASE 5: Massive Swing — Ranking Stress ═══");

    const swingData = createMassiveSwingData(BASELINE_RESPONSE);
    const stocks = swingData.data.map(TvScanner.mapMarketRow);

    const alpha = stocks
        .map(s => { const svs = calcSVS(s); return svs ? { ...s, _svs: svs } : null; })
        .filter(Boolean)
        .sort((a, b) => b._svs - a._svs);

    assert(alpha.length >= 5, "Massive Swing: at least 5 qualifying alpha stocks", `got ${alpha.length}`);

    // Top stock should have highest RVOL * change combo
    if (alpha.length >= 2) {
        assert(alpha[0]._svs >= alpha[1]._svs, "Massive Swing: TOP-1 has highest SVS");
    }

    // Log ranking
    for (let i = 0; i < Math.min(5, alpha.length); i++) {
        const s = alpha[i];
        INFO(`  #${i + 1} ${s.symbol}: SVS=${s._svs.toFixed(0)}, RVOL=${s.rvol_intraday_5m.toFixed(0)}, Chg=${s.change_from_open.toFixed(0)}%`);
    }
}

async function testPhase6_RealTelegramIntegration(telegramService) {
    INFO("═══ PHASE 6: Real Telegram — Dashboard + Alerts ═══");

    // 6a. Test dashboard send + pin
    INFO("  Step 1: Sending initial dashboard...");
    const stocks = BASELINE_RESPONSE.data.map(TvScanner.mapMarketRow);
    const alpha = stocks.map(s => { const svs = calcSVS(s); return svs ? { ...s, _svs: svs } : null; })
        .filter(Boolean).sort((a, b) => b._svs - a._svs).slice(0, 5);
    const bear = stocks.map(s => { const hss = calcHSS(s); return hss ? { ...s, _hss: hss } : null; })
        .filter(Boolean).sort((a, b) => b._hss - a._hss).slice(0, 5);

    const dashText = formatDashboard(alpha, bear, new Map(), new Date());
    const sendResult = await telegramService.sendMessageHTML(dashText);
    assert(sendResult?.success, "Telegram: dashboard message sent", JSON.stringify(sendResult?.error?.message || ""));
    const dashMsgId = sendResult?.message?.message_id;
    if (dashMsgId) INFO(`  Dashboard msg ID: ${dashMsgId}`);

    // 6b. Pin the dashboard
    if (dashMsgId) {
        INFO("  Step 2: Pinning dashboard...");
        const pinResult = await telegramService.pinMessage(dashMsgId);
        assert(pinResult?.success, "Telegram: dashboard pinned", JSON.stringify(pinResult?.error?.message || ""));
    }

    await sleep(2000);

    // 6c. Edit the dashboard (simulate 30s update)
    if (dashMsgId) {
        INFO("  Step 3: Editing dashboard (simulate update)...");
        const updatedDash = formatDashboard(alpha, bear, new Map(), new Date());
        const editResult = await telegramService.editMessage(dashMsgId, updatedDash);
        assert(editResult?.success, "Telegram: dashboard edited", JSON.stringify(editResult?.error?.message || ""));
    }

    await sleep(1500);

    // 6d. Send NEW ENTRANT alert
    INFO("  Step 4: Sending NEW ENTRANT alert...");
    const newAlertText = [
        `🚨 <b>NEW ALERT: TSLA</b>`,
        `⚡️ RVOL: 18.5 | 📈 Chg: +8.3%`,
        `💵 Value: $900M`,
        `[STRESS TEST] Спекулятивний вхід.`
    ].join("\n");
    const newResult = await telegramService.sendMessageHTML(newAlertText);
    assert(newResult?.success, "Telegram: NEW alert sent");

    await sleep(1500);

    // 6e. Send PUMP alert
    INFO("  Step 5: Sending PUMP alert...");
    const pumpAlertText = [
        `🔋 <b>NKTR: Fuel Injection!</b>`,
        `Об'єм різко виріс! RVOL: 13 → 25.`,
        `[STRESS TEST] Ціна пробиває локальний хай?`
    ].join("\n");
    const pumpResult = await telegramService.sendMessageHTML(pumpAlertText);
    assert(pumpResult?.success, "Telegram: PUMP alert sent");

    await sleep(1500);

    // 6f. Send DUMP alert
    INFO("  Step 6: Sending DUMP alert...");
    const dumpAlertText = [
        `⚠️ <b>WARNING: JZXN Dropping</b>`,
        `Ціна впала на -7.0% за хвилину. Можливий кінець тренду.`,
        `[STRESS TEST]`
    ].join("\n");
    const dumpResult = await telegramService.sendMessageHTML(dumpAlertText);
    assert(dumpResult?.success, "Telegram: DUMP alert sent");
}

async function testPhase7_ServiceLifecycle(config, telegramService) {
    INFO("═══ PHASE 7: Service Lifecycle — Start/Scan/Stop ═══");

    // Create service with FAST intervals for testing
    const testConfig = {
        ...config,
        marketScanIntervalMs: 3000,      // 3s scan (fast for testing)
        marketDashboardIntervalMs: 5000, // 5s dashboard
        marketAlertCooldownMs: 10000,    // 10s cooldown (fast)
        marketRvolPumpDelta: 5,
        marketDumpThreshold: -2
    };

    const marketService = createMarketService(testConfig, telegramService, mockScanner);

    // 7a. Start with baseline data
    INFO("  Step 1: Starting market service with baseline data...");
    setMockData(BASELINE_RESPONSE);
    await marketService.start();

    let state = marketService.getState();
    assert(state.isRunning, "Lifecycle: service is running after start");
    INFO(`  State: alpha=${state.alphaCount}, bear=${state.bearCount}, tracked=${state.trackedSymbols}`);

    await sleep(4000); // Wait for 1 scan cycle

    // 7b. Inject RVOL spike data
    INFO("  Step 2: Injecting RVOL spike data (NKTR 13→25)...");
    setMockData(createRvolSpikeData(BASELINE_RESPONSE));
    await sleep(4000); // Wait for scan to process

    state = marketService.getState();
    INFO(`  Alerts so far: ${state.alertCount}`);

    // 7c. Inject new entrant
    INFO("  Step 3: Injecting new entrant (TSLA)...");
    setMockData(createNewEntrantData(BASELINE_RESPONSE));
    await sleep(4000);

    state = marketService.getState();
    INFO(`  Alerts after new entrant: ${state.alertCount}`);

    // 7d. Inject price dump
    INFO("  Step 4: Injecting price dump (JZXN -7%)...");
    setMockData(createPriceDumpData(BASELINE_RESPONSE));
    await sleep(4000);

    state = marketService.getState();
    INFO(`  Alerts after dump: ${state.alertCount}`);

    // 7e. Dead zone — should produce no new alerts
    INFO("  Step 5: Injecting dead zone data...");
    const alertsBefore = state.alertCount;
    setMockData(createDeadZoneData(BASELINE_RESPONSE));
    await sleep(4000);

    state = marketService.getState();
    assert(state.alertCount === alertsBefore, "Dead Zone: no new alerts triggered", `before=${alertsBefore}, after=${state.alertCount}`);

    // 7f. Stop
    INFO("  Step 6: Stopping service...");
    await marketService.stop();
    state = marketService.getState();
    assert(!state.isRunning, "Lifecycle: service stopped cleanly");

    INFO(`  Final state: alerts=${state.alertCount}, tracked=${state.trackedSymbols}`);
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
    INFO("╔═══════════════════════════════════════════════════════════════╗");
    INFO("║    SHADOW VELOCITY SCANNER — STRESS TEST                    ║");
    INFO("╚═══════════════════════════════════════════════════════════════╝");

    let telegramService = null;

    try {
        // Load real config
        const rawConfig = parseConfig();
        const config = validateConfig(rawConfig);
        INFO(`Config loaded: chatId=${config.chatId}, thread=${config.threadId || "none"}`);

        // Connect to real Telegram
        telegramService = createTelegramService(config);
        await telegramService.initialize();
        INFO("Telegram connected ✓");

        // Announce test start
        await telegramService.sendMessage("🧪 STRESS TEST: Shadow Velocity Scanner starting...");
        await sleep(1000);

        // Run all phases
        await testPhase1_ScoringFormulas();
        await testPhase2_DashboardFormatting();
        await testPhase3_EdgeCases();
        await testPhase4_DeadZone();
        await testPhase5_MassiveSwing();
        await testPhase6_RealTelegramIntegration(telegramService);
        await testPhase7_ServiceLifecycle(config, telegramService);

        // ─── FINAL SUMMARY ──────────────────────────────────────────────
        INFO("");
        INFO("══════════════════════════════════════════════════════════════");
        INFO(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
        INFO("══════════════════════════════════════════════════════════════");

        // Send summary to Telegram
        const summary = [
            `🧪 <b>STRESS TEST COMPLETE</b>`,
            ``,
            `✅ Passed: ${passed}`,
            `❌ Failed: ${failed}`,
            `📊 Total: ${passed + failed}`,
            ``,
            failed === 0 ? "🎉 All tests passed!" : `⚠️ ${failed} test(s) failed — check logs`
        ].join("\n");
        await telegramService.sendMessageHTML(summary);

    } catch (error) {
        FAIL("FATAL", error.message);
        console.error(error);
    } finally {
        // Log analysis
        INFO("");
        INFO("═══ LOG ANALYSIS ═══");
        const alertLogs = logs.filter(l => l.includes("🔔") || l.includes("Alert"));
        INFO(`Total alert-related log entries: ${alertLogs.length}`);
        const errorLogs = logs.filter(l => l.includes("❌") || l.includes("FAIL"));
        INFO(`Total error entries: ${errorLogs.length}`);
        if (errorLogs.length > 0) {
            INFO("Failed tests:");
            errorLogs.forEach(l => INFO(`  ${l}`));
        }

        if (telegramService) {
            try { await telegramService.stop("TEST_COMPLETE"); } catch { }
        }
        // Give Telegram time to flush
        await sleep(2000);
        process.exit(failed > 0 ? 1 : 0);
    }
}

main();
