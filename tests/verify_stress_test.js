/**
 * Complex Stress Test for Stocks Scanner Architecture
 * Simulates transition from 09:20 (Premarket) to 09:40 (Market)
 * with 10 sequential data injections.
 */
import { createOrchestrator } from '../src/core/orchestrator.js';
import { createScanner } from '../src/services/scanner.js';
import { createRvolService } from '../src/services/rvolService.js';

// --- CONFIGURATION ---
const config = {
    premarketHours: { start: "04:00", end: "09:30" },
    premarketAlertStep: 1.0,
    rvolAlertStep: 1.0,
    rvolThreshold: 2,
    scanIntervalMs: 100, // Fast for simulation
    rvolIntervalMs: 100,
    timeouts: { gatekeeperIntervalMs: 50 },
    retry: { maxAttempts: 1 }
};

// --- MOCKED SERVICES ---
const telegramService = {
    sendMessage: async (msg) => {
        console.log(`\n📱 [TELEGRAM] Message:\n${msg.split('\n')[0]}... [truncated]`);
        return { success: true };
    }
};

let currentPremarketData = [];
let currentRvolData = [];

const mockScanner = {
    getStocks10: async () => currentPremarketData,
    getRvolSurgeStocks: async () => currentRvolData
};

// --- MOCKED TIME ---
let mockState = { inPremarket: false, inMarket: false };
const mockTimeUtils = {
    isPremarketTime: () => mockState.inPremarket,
    isMarketNow: () => mockState.inMarket
};

// --- DATA INJECTION HELPERS ---
const createRawGrowthRow = (symbol, change) => ({
    s: symbol,
    d: ["Name", 150, change - 1, change, change, 1000000, 0, 0, 10000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150]
});

const createRawRvolRow = (symbol, rvol) => ({
    s: symbol,
    d: ["Name", 0, 0, 0, 0, 0, rvol, 10000000, 150, 0, 0, 0, 0, 10, 0, 0, 0, 0, 2] // Index 6 is RVOL, 8 is Close, 13 is Change
});

// --- STRESS TEST SCENARIO ---
async function runStressTest() {
    console.log('=== STARTING COMPLEX STRESS TEST ===');

    const growthScanner = createScanner(config, telegramService, mockScanner);
    const rvolScanner = createRvolService(config, telegramService, mockScanner);
    const orchestrator = createOrchestrator(config, { growthScanner, rvolScanner }, mockTimeUtils);

    orchestrator.start();

    // STEP 1: PREMARKET PHASE (09:20 - 09:30)
    console.log('\n--- PHASE 1: PREMARKET (09:20) ---');
    mockState = { inPremarket: true, inMarket: false };

    for (let i = 1; i <= 5; i++) {
        console.log(`\nInjection #${i} (Premarket Growth)`);
        currentPremarketData = [
            createRawGrowthRow('NASDAQ:AAPL', 10 + i * 0.5), // Growing slowly (0.5% steps -> alert every 2 injections)
            createRawGrowthRow('NASDAQ:TSLA', 15 + i)       // Growing fast (1% steps -> alert every injection)
        ];
        await new Promise(r => setTimeout(r, 150));
    }

    // STEP 2: TRANSITION PHASE (09:30)
    console.log('\n--- PHASE 2: TRANSITION TO MARKET (09:30) ---');
    mockState = { inPremarket: false, inMarket: true };
    await new Promise(r => setTimeout(r, 200));

    // STEP 3: REGULAR MARKET PHASE (09:30 - 09:40)
    console.log('\n--- PHASE 3: REGULAR MARKET (09:40) ---');
    for (let i = 1; i <= 5; i++) {
        console.log(`\nInjection #${i + 5} (Market RVOL)`);
        currentRvolData = [
            createRawRvolRow('NASDAQ:NVDA', 2 + i * 0.5), // RVOL growing
            createRawRvolRow('NASDAQ:AMD', 5 + i)        // RVOL surging
        ];
        await new Promise(r => setTimeout(r, 150));
    }

    console.log('\n--- STOPPING ORCHESTRATOR ---');
    orchestrator.stop();
    console.log('\n=== STRESS TEST COMPLETED ===');
}

runStressTest().catch(console.error);
