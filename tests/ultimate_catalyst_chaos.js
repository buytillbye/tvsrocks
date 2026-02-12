/**
 * @fileoverview ULTIMATE CATALYST CHAOS — Detailed State Diff Version
 * 
 * Simulates 7 days with 150 tickers.
 * Log Format: Context -> Available Tickers -> Before -> Change -> After -> Service Reaction.
 */
import { createCatalystService } from "../src/services/catalystService.js";
import { createOrchestrator } from "../src/core/orchestrator.js";
import { TvScanner } from "../src/services/tradingview.js";
import fs from 'fs';
import path from 'path';

// ─── LOGGING SYSTEM ─────────────────────────────────────────────────────────────
const LOG_DIR = path.join(process.cwd(), 'tests', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const LOG_FILE = path.join(LOG_DIR, `ultimate_chaos_detailed_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);

let serviceLogs = [];
let captureActive = false;

const log = (level, msg) => {
    const ts = new Date().toISOString();
    const entry = `[${ts}] [${level}] ${msg}`;

    if (captureActive && (msg.includes('Catalyst') || msg.includes('TRIGGER'))) {
        serviceLogs.push(msg);
    }

    console.log(entry);
    fs.appendFileSync(LOG_FILE, entry + '\n');
};

const INFO = (msg) => log("INFO", msg);
const PASS = (msg) => log("✅ PASS", msg);
const FAIL = (msg, reason) => log("❌ FAIL", `${msg}: ${reason}`);

let totalPassed = 0;
let totalFailed = 0;
const assert = (cond, name, detail = "") => {
    if (cond) { totalPassed++; PASS(name); }
    else { totalFailed++; FAIL(name, detail); }
    return cond;
};

// ─── TIME STEPPER ──────────────────────────────────────────────────────────────
class TimeStepper {
    constructor(startTime) {
        this.currentTime = new Date(startTime);
    }
    step(ms) {
        this.currentTime = new Date(this.currentTime.getTime() + ms);
    }
    getNow() {
        return new Date(this.currentTime);
    }
    isPremarketTime() {
        const h = this.currentTime.getHours();
        return h >= 4 && h < 9;
    }
    isMarketNow() {
        const h = this.currentTime.getHours();
        const m = this.currentTime.getMinutes();
        const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        return timeStr >= "09:30" && timeStr < "16:00";
    }
    isWeekend() {
        const day = this.currentTime.getDay();
        return day === 0 || day === 6;
    }
}

// ─── DATA GENERATOR ──────────────────────────────────────────────────────────
const TICKERS = Array.from({ length: 150 }, (_, i) => `NASDAQ:C${String(i).padStart(3, '0')}`);

const generateChaoticData = (stepper, chaosMode = false) => {
    const data = TICKERS.map((ticker, idx) => {
        const isFaderCandidate = (idx % 3 === 0);
        const isBounceCandidate = (idx % 5 === 0);
        let gap = 0, vol = 1000000, change = 0;

        if (isFaderCandidate) gap = 10.0 + (idx % 10);
        if (isBounceCandidate) gap = -15.0 - (idx % 5);

        if (chaosMode && Math.random() < 0.2) {
            const roll = Math.random();
            if (roll < 0.2) gap = NaN;
            else if (roll < 0.4) gap = null;
            else if (roll < 0.6) vol = Infinity;
            else change = -9999.9;
        }

        if (stepper.isMarketNow()) {
            const h = stepper.getNow().getHours();
            const m = stepper.getNow().getMinutes();
            if (h === 9 && m >= 35) {
                if (isFaderCandidate) change = -1.0;
                if (isBounceCandidate) change = 1.0;
            }
        }

        return {
            s: ticker,
            d: [ticker.split(':')[1], 100, "stock", ["common"], 100, 1, "false", 0, "USD",
                10000000, 10, vol, 10000000, 50, 5, 5, change, 1000000000, "USD", vol, gap, 1, 1, 1, 1, gap]
        };
    });
    return { data, totalCount: TICKERS.length };
};

// ─── RUN TEST ───────────────────────────────────────────────────────────────
async function runDetailedStress() {
    INFO("🚀 STARTING DETAILED CHAOS STRESS TEST...");

    const stepper = new TimeStepper("2026-02-09T07:00:00+02:00");
    const config = {
        chatId: 12345,
        catalystWatchlistIntervalMs: 100,
        catalystActiveIntervalMs: 100,
        timeouts: { gatekeeperIntervalMs: 100 }
    };

    const alertsSent = [];
    const mockScanner = {
        getCatalystSetupStocks: async () => generateChaoticData(stepper, true),
        getMarketStocks: async () => generateChaoticData(stepper, true),
        mapRow: TvScanner.mapRow,
        mapMarketRow: TvScanner.mapMarketRow
    };

    const catalyst = createCatalystService(config, { sendMessage: async (m) => alertsSent.push(m) }, mockScanner);
    const orchestrator = createOrchestrator(config, { catalystScanner: catalyst }, stepper);

    orchestrator.start();
    captureActive = true;

    const lastStateMap = new Map();
    const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

    for (let d = 0; d < 7; d++) {
        INFO(`\n${"=".repeat(60)}\n>>> SIMULATING ${DAYS[d]} <<<\n${"=".repeat(60)}`);
        lastStateMap.clear();

        for (let h = 7; h < 14; h++) {
            for (let m = 0; m < 60; m += 15) {
                serviceLogs = [];
                const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

                INFO(`\n[EVENT CYCLE] ${timeStr} - ${DAYS[d]}`);
                const currentData = await generateChaoticData(stepper, true);
                INFO(`Tickers currently available: ${currentData.totalCount}`);

                // Sample a few tickers for diff logging
                const sampleTickers = ["NASDAQ:C000", "NASDAQ:C003", "NASDAQ:C005"];
                sampleTickers.forEach(t => {
                    const before = lastStateMap.get(t) || { gap: 'N/A', change: 'N/A' };
                    const stock = currentData.data.find(s => s.s === t);
                    const after = { gap: stock.d[25], change: stock.d[16] };

                    INFO(`\n--- TICKER STATUS CHANGE: ${t} ---`);
                    INFO(`As it was BEFORE: Gap=${before.gap}, Change=${before.change}`);
                    INFO(`What changes occurred: Step +15min, Mode=${stepper.isMarketNow() ? 'Market' : 'Pre'}, Chaos Injection`);
                    INFO(`As it is AFTER:  Gap=${after.gap}, Change=${after.change}`);

                    lastStateMap.set(t, after);
                });

                // Wait for service to process the "After" state
                await new Promise(r => setTimeout(r, 400));

                INFO(`\nSERVICE REACTIONS for ${timeStr}:`);
                if (serviceLogs.length === 0) {
                    INFO("- Service checked data, no triggers or issues found.");
                } else {
                    serviceLogs.forEach(l => INFO(`> ${l}`));
                }

                const state = catalyst.getState();
                INFO(`Current Service State: status=${state.isRunning ? (state.isWatchlistOnly ? 'Watchlist' : 'Active') : 'OFF'}, candidates=${state.watchlist.size}, alertsSent=${state.triggered.size}`);

                // Basic lifecycle assertions
                const isWeekend = d >= 5;
                if (isWeekend) assert(!state.isRunning, `Weekend ${timeStr}: OFF`);
                else {
                    if (timeStr >= "08:00" && timeStr < "09:30") assert(state.isRunning && state.isWatchlistOnly, `${timeStr}: Setup Mode`);
                    else if (timeStr >= "09:30" && timeStr < "13:30") assert(state.isRunning && !state.isWatchlistOnly, `${timeStr}: Active Mode`);
                    else assert(!state.isRunning, `${timeStr}: OFF`);
                }

                stepper.step(15 * 60 * 1000);
            }
        }
        stepper.step(17 * 60 * 60 * 1000);
    }

    INFO(`\n═══ DETAILED CHAOS SUMMARY ═══`);
    INFO(`Total Assertions: ${totalPassed + totalFailed} (${totalPassed} Pass, ${totalFailed} Fail)`);
    orchestrator.stop();
    process.exit(totalFailed > 0 ? 1 : 0);
}

runDetailedStress().catch(e => {
    log("FATAL", e.stack);
    process.exit(1);
});
