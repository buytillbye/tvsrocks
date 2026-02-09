/**
 * Verification script for testing stepper logic and theories.
 * You can modify mockData to see how the system reacts to different price/change scenarios.
 */
import { processStockData } from '../src/services/stock.js';

// --- CONFIGURATION ---
const config = {
    premarketAlertStep: 1.0,     // Notifications sent every 1% of growth
    premarketThreshold: 10,      // Minimum change to start tracking
    retry: { maxAttempts: 1 },
    sendOnStartup: true,         // Send alerts even on the first scan
    timeouts: { shutdownGraceMs: 100 }
};

// --- MOCK SERVICES ---
const telegramService = {
    sendMessage: async (msg) => {
        console.log('\n📱 [TELEGRAM] Sending message:\n' + msg + '\n');
        return { success: true };
    }
};

let mockData = [];
const mockScanner = {
    getStocks10: async () => mockData
};

/**
 * Helper to create mock stock data
 * @param {string} symbol Ticker
 * @param {number} change Current pre-market change %
 * @param {number} price Current price
 */
const createMockStock = (symbol, change, price = 150) => ({
    s: symbol,
    d: [
        symbol.split(':')[1], // name (d[0])
        price,                 // close (d[1])
        change - 1,            // change prev (d[2])
        change,                // premarket_change (d[3])
        change,                // premarket_change_from_open (d[4])
        1000000,               // volume (d[5])
        0, 0,
        10000000,              // float (d[8])
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        price,                 // premarket_close (d[27])
    ]
});

// --- TEST SCENARIO ---
async function runTest() {
    let state = {
        lastReportedChanges: new Map(),
        isFirstScan: false,
        sendOnStartup: config.sendOnStartup
    };

    console.log('--- STARTING STEPPER TEST ---');

    // 1. Initial Alert
    console.log('\nScenario 1: New stock detected at 10.5%');
    mockData = [createMockStock('NASDAQ:AAPL', 10.5)];
    state = await processStockData(10, state, telegramService, config, mockScanner);

    // 2. Small growth (below step)
    console.log('\nScenario 2: Price grows to 11.2% (growth +0.7% < 1.0% step)');
    mockData = [createMockStock('NASDAQ:AAPL', 11.2)];
    state = await processStockData(10, state, telegramService, config, mockScanner);
    console.log('💡 Note: No alert expected here.');

    // 3. Large growth (above step)
    console.log('\nScenario 3: Price grows to 12.0% (total growth since last alert: 1.5% > 1.0% step)');
    mockData = [createMockStock('NASDAQ:AAPL', 12.0)];
    state = await processStockData(10, state, telegramService, config, mockScanner);

    // 4. Multiple stocks
    console.log('\nScenario 4: New stock MSFT appears at 15%');
    mockData = [
        createMockStock('NASDAQ:AAPL', 12.2),
        createMockStock('NASDAQ:MSFT', 15.0)
    ];
    state = await processStockData(10, state, telegramService, config, mockScanner);

    console.log('\n--- TEST COMPLETED ---');
}

runTest().catch(console.error);
