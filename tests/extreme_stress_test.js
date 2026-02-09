/**
 * 🔥 EXTREME ARCHITECTURAL STRESS TEST
 * This script simulates the "worst day" on the market:
 * - Unstable API (random 500 errors)
 * - Malformed data (missing fields, nulls)
 * - Rapid time jumps (simulating edge cases at 09:30:00)
 * - Massive influx of duplicate/noisy data
 */
import { createOrchestrator } from '../src/core/orchestrator.js';
import { createScanner } from '../src/services/scanner.js';
import { createRvolService } from '../src/services/rvolService.js';

const config = {
    premarketHours: { start: "04:00", end: "09:30" },
    premarketThreshold: 10,
    rvolThreshold: 2,
    premarketAlertStep: 1.0,
    rvolAlertStep: 1.0,
    scanIntervalMs: 50,    // High frequency
    rvolIntervalMs: 50,    // High frequency
    timeouts: { gatekeeperIntervalMs: 100, shutdownGraceMs: 50 },
    retry: { maxAttempts: 1 }
};

// --- CHAOS SERVICES ---
const chaosTelegram = {
    sendMessage: async (msg) => {
        // console.log(`[CHAOS TG] ${msg.split('\n')[0]}`);
        return { success: true };
    }
};

let currentData = [];
let shouldFail = false;
let malformedMode = false;

const scannerMock = {
    getStocks10: async () => {
        if (shouldFail) throw new Error("API_TIMEOUT_504");
        if (malformedMode) return [{ s: "BAD_TICKER", d: null }]; // Malformed row
        return currentData;
    },
    getRvolSurgeStocks: async () => {
        if (shouldFail) throw new Error("API_ERROR_500");
        return currentData;
    }
};

let mockTime = { inPremarket: false, inMarket: false };
const mockTimeUtils = {
    isPremarketTime: () => mockTime.inPremarket,
    isMarketNow: () => mockTime.inMarket
};

const createRow = (symbol, val) => ({
    s: symbol,
    d: ["Name", 100, 0, val, val, 1000000, val, 1000000, 100, 0, 0, 0, 0, 10, 0, 0, 0, 0, val]
});

async function runChaos() {
    console.log('\n--- 🌪️ STARTING EXTREME CHAOS TEST ---\n');

    const growthScanner = createScanner(config, chaosTelegram, scannerMock);
    const rvolScanner = createRvolService(config, chaosTelegram, scannerMock);
    const orchestrator = createOrchestrator(config, { growthScanner, rvolScanner }, mockTimeUtils);

    orchestrator.start();

    // SCENARIO 1: API UNSTABILITY
    console.log('Phase 1: API Instability & Recovery');
    mockTime = { inPremarket: true, inMarket: false };
    currentData = [createRow('CHAOS:PUMP', 15)];

    shouldFail = true;
    console.log('   [!] Simulating API Crash...');
    await new Promise(r => setTimeout(r, 150));

    shouldFail = false;
    console.log('   [!] API Recovered. System should resume scanning.');
    await new Promise(r => setTimeout(r, 150));

    // SCENARIO 2: DATA MALFORMATION
    console.log('\nPhase 2: Malformed Data (Nulls/Missing Fields)');
    malformedMode = true;
    await new Promise(r => setTimeout(r, 150));
    malformedMode = false;
    console.log('   [!] Finished malformed data injection. System stable? (Check logs)');

    // SCENARIO 3: RAPID TRANSITION (THE JITTER TEST)
    console.log('\nPhase 3: The Jitter Test (Rapid Time Jumps)');
    for (let i = 0; i < 5; i++) {
        mockTime = { inPremarket: i % 2 === 0, inMarket: i % 2 !== 0 };
        // console.log(`   [Jump ${i}] Premarket: ${mockTime.inPremarket}, Market: ${mockTime.inMarket}`);
        await new Promise(r => setTimeout(r, 120));
    }

    // SCENARIO 4: THE ROLLERCOASTER (HYPER OPTIMIZED STEPPER)
    console.log('\nPhase 4: The Rollercoaster (Stepper Logic Stress)');
    mockTime = { inPremarket: true, inMarket: false };
    const values = [10.5, 10.8, 11.2, 11.1, 12.0, 9.0, 13.0, 13.1, 14.5];
    for (const v of values) {
        console.log(`   [Injection] AAPL at ${v}%`);
        currentData = [createRow('NASDAQ:AAPL', v)];
        await new Promise(r => setTimeout(r, 100));
    }

    // SCENARIO 5: CONCURRENT VOLUME BURST
    console.log('\nPhase 5: Concurrent Volume Burst');
    mockTime = { inPremarket: false, inMarket: true };
    const burst = Array.from({ length: 50 }, (_, i) => createRow(`BURST:${i}`, 5 + i));
    currentData = burst;
    await new Promise(r => setTimeout(r, 300));

    orchestrator.stop();
    console.log('\n--- ✅ EXTREME CHAOS TEST COMPLETED ---\n');
}

runChaos();
