/**
 * 🧪 VERIFICATION: NEW ALERT THRESHOLDS
 * Premarket Growth Step: 15%
 * RVOL Threshold: 3.0
 * RVOL Step: 2.0
 */
import { createOrchestrator } from '../src/core/orchestrator.js';
import { createScanner } from '../src/services/scanner.js';
import { createRvolService } from '../src/services/rvolService.js';

const config = {
    premarketHours: { start: "04:00", end: "09:30" },
    premarketThreshold: 10,
    premarketAlertStep: 15.0, // NEW!
    rvolThreshold: 3.0,       // NEW!
    rvolAlertStep: 2.0,        // NEW!
    scanIntervalMs: 50,
    rvolIntervalMs: 50,
    sendOnStartup: true,     // Force alerts from the first scan
    timeouts: { gatekeeperIntervalMs: 200 },
    retry: { maxAttempts: 1 }
};

const telegramService = {
    sendMessage: async (msg) => {
        const lines = msg.split('\n');
        console.log(`   📱 [TG SEND]: ${lines[0]} ${lines[2] || ''}`);
        return { success: true };
    }
};

let premarketData = [];
let rvolData = [];
const mockScanner = {
    getStocks10: async (cfg, threshold) => {
        // Only return stocks above threshold
        return premarketData.filter(s => s.d[3] >= (threshold || cfg.premarketThreshold));
    },
    getRvolSurgeStocks: async (cfg, threshold) => {
        // Only return stocks above threshold
        return rvolData.filter(s => s.d[6] >= (threshold || cfg.rvolThreshold));
    }
};

let mockTime = { inPremarket: false, inMarket: false };
const mockTimeUtils = {
    isPremarketTime: () => mockTime.inPremarket,
    isMarketNow: () => mockTime.inMarket
};

const createGrowthRow = (symbol, change) => ({ s: symbol, d: ["Name", 150, 0, change, change, 1000000, 0, 0, 10000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 150] });
const createRvolRow = (symbol, rvol) => ({ s: symbol, d: ["Name", 0, 0, 0, 0, 0, rvol, 1000000, 150, 0, 0, 0, 0, 10, 0, 0, 0, 0, 2] });

async function run() {
    console.log('\n--- 🧪 ТЕСТ НОВИХ ПАРАМЕТРІВ (Refined) ---');
    console.log(`Крок премаркету: ${config.premarketAlertStep}%`);
    console.log(`Поріг RVOL: ${config.rvolThreshold}, Крок RVOL: ${config.rvolAlertStep}\n`);

    const growthScanner = createScanner(config, telegramService, mockScanner);
    const rvolScanner = createRvolService(config, telegramService, mockScanner);
    const orchestrator = createOrchestrator(config, { growthScanner, rvolScanner }, mockTimeUtils);

    // 1. PREMARKET GROWTH TEST
    console.log('--- PHASE 1: PREMARKET GROWTH (Step 15%) ---');
    mockTime = { inPremarket: true, inMarket: false };
    orchestrator.start();

    premarketData = [createGrowthRow('NASDAQ:AAPL', 11.0)];
    console.log('\n1. AAPL на 11% (Перший алерт)');
    await new Promise(r => setTimeout(r, 150));

    premarketData = [createGrowthRow('NASDAQ:AAPL', 25.0)];
    console.log('2. AAPL виріс до 25% (Ріст +14% < кроку 15%)');
    await new Promise(r => setTimeout(r, 150));
    console.log('   (Очікуємо тишу)');

    premarketData = [createGrowthRow('NASDAQ:AAPL', 27.0)];
    console.log('\n3. AAPL виріс до 27% (Ріст +16% > кроку 15%!)');
    await new Promise(r => setTimeout(r, 150));

    // 2. RVOL TEST
    console.log('\n--- PHASE 2: RVOL (Threshold 3.0, Step 2.0) ---');
    mockTime = { inPremarket: false, inMarket: true };
    await new Promise(r => setTimeout(r, 300));

    rvolData = [createRvolRow('NASDAQ:NVDA', 2.5)];
    console.log('1. NVDA RVOL 2.5x (Нижче порогу 3.0)');
    await new Promise(r => setTimeout(r, 150));
    console.log('   (Очікуємо тишу)');

    rvolData = [createRvolRow('NASDAQ:NVDA', 3.5)];
    console.log('\n2. NVDA RVOL 3.5x (Перший алерт, поріг 3.0 подолано)');
    await new Promise(r => setTimeout(r, 150));

    rvolData = [createRvolRow('NASDAQ:NVDA', 4.5)];
    console.log('3. NVDA RVOL 4.5x (Ріст +1.0 < кроку 2.0)');
    await new Promise(r => setTimeout(r, 150));
    console.log('   (Очікуємо тишу)');

    rvolData = [createRvolRow('NASDAQ:NVDA', 5.6)];
    console.log('\n4. NVDA RVOL 5.6x (Ріст +2.1 > кроку 2.0!)');
    await new Promise(r => setTimeout(r, 150));

    orchestrator.stop();
    console.log('\n--- ✅ ТЕСТ ЗАВЕРШЕНО ---');
}

run();
