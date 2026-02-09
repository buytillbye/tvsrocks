/**
 * Verification script for Professional Orchestrator Architecture
 */
import { createOrchestrator } from '../src/core/orchestrator.js';

// --- CONFIGURATION ---
const config = {
    premarketHours: { start: "04:00", end: "09:30" },
    timeouts: { gatekeeperIntervalMs: 100 }
};

// --- MOCK SERVICES ---
let growthRunning = false;
let rvolRunning = false;

const growthScanner = {
    start: async () => { growthRunning = true; },
    stop: () => { growthRunning = false; },
    getState: () => ({ isRunning: growthRunning })
};

const rvolScanner = {
    start: async () => { rvolRunning = true; },
    stop: () => { rvolRunning = false; },
    getState: () => ({ isRunning: rvolRunning })
};

// --- MOCK TIME ---
let mockTime = { inPremarket: false, inMarket: false };
const mockTimeUtils = {
    isPremarketTime: () => mockTime.inPremarket,
    isMarketNow: () => mockTime.inMarket
};

async function runTest() {
    console.log('--- STARTING ORCHESTRATOR ARCHITECTURE TEST ---');
    const orchestrator = createOrchestrator(config, { growthScanner, rvolScanner }, mockTimeUtils);

    // 1. Premarket Time
    console.log('\nScenario 1: Testing Premarket hours');
    mockTime = { inPremarket: true, inMarket: false };
    orchestrator.start();
    await new Promise(r => setTimeout(r, 150));
    console.log(`Growth Scanner running: ${growthRunning} (Expected: true)`);
    console.log(`RVOL Scanner running: ${rvolRunning} (Expected: false)`);

    // 2. Regular Market Time
    console.log('\nScenario 2: Testing Market hours');
    mockTime = { inPremarket: false, inMarket: true };
    await new Promise(r => setTimeout(r, 150));
    console.log(`Growth Scanner running: ${growthRunning} (Expected: false)`);
    console.log(`RVOL Scanner running: ${rvolRunning} (Expected: true)`);

    // 3. Weekend / Off hours
    console.log('\nScenario 3: Testing Off hours');
    mockTime = { inPremarket: false, inMarket: false };
    await new Promise(r => setTimeout(r, 150));
    console.log(`Growth Scanner running: ${growthRunning} (Expected: false)`);
    console.log(`RVOL Scanner running: ${rvolRunning} (Expected: false)`);

    orchestrator.stop();
    console.log('\n--- TEST COMPLETED ---');
}

runTest().catch(console.error);
