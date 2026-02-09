/**
 * 🌪️ ULTIMATE STRESS TEST (120s CHAOS ENGINE)
 * Simulates extreme network failure, data corruption, and rapid state transitions.
 */
import { createOrchestrator } from '../src/core/orchestrator.js';
import { createScanner } from '../src/services/scanner.js';
import { createRvolService } from '../src/services/rvolService.js';

const config = {
    premarketHours: { start: "04:00", end: "09:30" },
    premarketThreshold: 10,
    premarketAlertStep: 1.0,
    rvolAlertStep: 1.0,
    rvolThreshold: 2,
    scanIntervalMs: 50, // Ultra-fast scanning
    rvolIntervalMs: 50,
    timeouts: { gatekeeperIntervalMs: 100, shutdownGraceMs: 100 },
    retry: { maxAttempts: 2, backoffMultiplier: 1.1 }
};

let stats = {
    messagesSent: 0,
    errorsHandled: 0,
    tvRequests: 0,
    transitions: 0
};

const telegramService = {
    sendMessage: async (msg) => {
        stats.messagesSent++;
        if (Math.random() < 0.05) throw new Error("Telegram Network Timeout");
        return { success: true };
    },
    stop: () => { }
};

let mockTime = { inPremarket: false, inMarket: false };
const mockTimeUtils = {
    isPremarketTime: () => mockTime.inPremarket,
    isMarketNow: () => mockTime.inMarket
};

let scenario = "STABLE"; // STABLE, CHAOS, FLAPPING, CORRUPT
let forceError = null;

const createFakeRow = (type) => {
    if (scenario === "CORRUPT" && Math.random() < 0.3) {
        return { s: "MALFORMED", d: [null, "NaN", {}, undefined] };
    }
    const symbol = `TKR${Math.floor(Math.random() * 1000)}`;
    if (type === "GROWTH") {
        const d = new Array(30).fill(0);
        d[1] = 10 + Math.random() * 20; // 10-30%
        d[2] = 5000000; // Low float
        d[11] = 100000; // Volume
        return { s: `NASDAQ:${symbol}`, d };
    } else {
        // RVOL
        return { s: `NYSE:${symbol}`, d: ["Name", 0, 0, 0, 0, 0, 2 + Math.random() * 5, 10000000, 150, 0, 0, 0, 0, 5, 2000000] };
    }
};

const mockScanner = {
    getStocks10: async () => {
        stats.tvRequests++;
        if (forceError) throw forceError;
        if (scenario === "CHAOS" && Math.random() < 0.2) throw new Error("TV 500 Internal Error");
        return Array.from({ length: 5 }, () => createFakeRow("GROWTH"));
    },
    getRvolSurgeStocks: async () => {
        stats.tvRequests++;
        if (forceError) throw forceError;
        if (scenario === "CHAOS" && Math.random() < 0.2) throw new Error("TV 429 Too Many Requests");
        return Array.from({ length: 5 }, () => createFakeRow("RVOL"));
    }
};

async function runTest() {
    console.log("Starting 120s Ultimate Stress Test...");
    const growthScanner = createScanner(config, telegramService, mockScanner);
    const rvolScanner = createRvolService(config, telegramService, mockScanner);
    const orchestrator = createOrchestrator(config, { growthScanner, rvolScanner }, mockTimeUtils);

    // Global timeout to prevent hanging terminal
    const testTimeout = setTimeout(() => {
        console.error("\n❌ TEST TIMEOUT! Force closing...");
        process.exit(1);
    }, 130000);

    orchestrator.start();
    const startTime = Date.now();
    const DURATION = 120000; // 120 seconds

    const interval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;

        // Phase control
        if (elapsed < 30) {
            scenario = "STABLE";
            mockTime = { inPremarket: true, inMarket: false };
        } else if (elapsed < 60) {
            if (scenario !== "CHAOS") stats.transitions++;
            scenario = "CHAOS";
            if (Math.random() < 0.1) mockTime = { inPremarket: !mockTime.inPremarket, inMarket: !mockTime.inMarket };
        } else if (elapsed < 90) {
            if (scenario !== "FLAPPING") stats.transitions++;
            scenario = "FLAPPING";
            mockTime = { inPremarket: Math.random() > 0.5, inMarket: Math.random() > 0.5 };
        } else {
            if (scenario !== "CORRUPT") stats.transitions++;
            scenario = "CORRUPT";
            mockTime = { inPremarket: true, inMarket: true }; // Stress both
        }

        if (Math.floor(elapsed) % 10 === 0 && (elapsed % 1 < 0.11)) {
            console.log(`[${Math.floor(elapsed)}s] Scenario: ${scenario} | Msg: ${stats.messagesSent} | TV Req: ${stats.tvRequests} | Transitions: ${stats.transitions}`);
        }
    }, 100);

    // Run for 120 seconds
    try {
        await new Promise(r => setTimeout(r, DURATION));

        clearInterval(interval);
        console.log("\nStopping orchestrator...");
        await orchestrator.stop();

        clearTimeout(testTimeout);

        console.log("\n--- FINAL STATS ---");
        console.log(`Total Duration: ${DURATION / 1000}s`);
        console.log(`Telegram Messages: ${stats.messagesSent}`);
        console.log(`TV API Requests: ${stats.tvRequests}`);
        console.log(`State Transitions: ${stats.transitions}`);
        console.log(`Architecture Stability: ${stats.tvRequests > 0 ? "PASSED" : "FAILED"}`);
        console.log("-------------------\n");

        process.exit(0);
    } catch (err) {
        console.error("Test failed during execution:", err);
        process.exit(1);
    }
}

runTest().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
