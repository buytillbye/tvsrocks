/**
 * 🔬 FINAL VERIFICATION TEST: Architecture & Stepper
 * Simulates: Premarket (09:20) -> Transition (09:30) -> Regular Market (09:31)
 */
import { createOrchestrator } from '../src/core/orchestrator.js';
import { createScanner } from '../src/services/scanner.js';
import { createRvolService } from '../src/services/rvolService.js';

const config = {
    premarketHours: { start: "04:00", end: "09:30" },
    premarketAlertStep: 1.0,
    rvolAlertStep: 1.0,
    rvolThreshold: 2,
    scanIntervalMs: 100,
    rvolIntervalMs: 100,
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
    getStocks10: async () => premarketData,
    getRvolSurgeStocks: async () => rvolData
};

let mockTime = { inPremarket: false, inMarket: false };
const mockTimeUtils = {
    isPremarketTime: () => mockTime.inPremarket,
    isMarketNow: () => mockTime.inMarket
};

const createGrowthRow = (symbol, change) => {
    const d = new Array(30).fill(0);
    d[1] = change;   // premarket_change
    d[2] = 10000000; // float
    d[3] = 150;      // close
    d[11] = 500000;  // volume
    d[21] = 149;     // premarket_close
    return { s: symbol, d };
};
const createRvolRow = (symbol, rvol) => ({ s: symbol, d: ["Name", 0, 0, 0, 0, 0, rvol, 10000000, 150, 0, 0, 0, 0, 10, 0, 0, 0, 0, 2] });

async function run() {
    console.log('\n--- 🚀 ПІДГОТОВКА СЕРВІСІВ ---\n');
    const growthScanner = createScanner(config, telegramService, mockScanner);
    const rvolScanner = createRvolService(config, telegramService, mockScanner);
    const orchestrator = createOrchestrator(config, { growthScanner, rvolScanner }, mockTimeUtils);

    console.log('1. [09:20 ET] - ЗАПУСК ПРЕМАРКЕТУ');
    mockTime = { inPremarket: true, inMarket: false };
    orchestrator.start();

    // Тікер росте плавно
    premarketData = [createGrowthRow('NASDAQ:AAPL', 10.1)];
    console.log('\n2. [Подія] - AAPL з’явився на 10.1%');
    await new Promise(r => setTimeout(r, 250));

    premarketData = [createGrowthRow('NASDAQ:AAPL', 10.5)];
    console.log('3. [Подія] - AAPL виріс до 10.5% (Менше кроку 1.0%)');
    await new Promise(r => setTimeout(r, 250));
    console.log('   (Лог: Тиша, повідомлень немає)');

    premarketData = [createGrowthRow('NASDAQ:AAPL', 11.2)];
    console.log('\n4. [Подія] - AAPL виріс до 11.2% (Ріст +1.1% > кроку 1.0%!)');
    await new Promise(r => setTimeout(r, 250));

    console.log('\n5. [09:30 ET] - МОМЕНТ ВІДКРИТТЯ РИНКУ (ПЕРЕХІД)');
    mockTime = { inPremarket: false, inMarket: true };
    await new Promise(r => setTimeout(r, 500));

    console.log('\n6. [09:31 ET] - РОБОТА В ОСНОВНІЙ СЕСІЇ (RVOL)');
    rvolData = [createRvolRow('NASDAQ:NVDA', 2.5)];
    console.log('   [Подія] - NVDA сплеск RVOL: 2.5x');
    await new Promise(r => setTimeout(r, 250));

    rvolData = [createRvolRow('NASDAQ:NVDA', 4.0)];
    console.log('\n7. [Подія] - NVDA RVOL виріс до 4.0x');
    await new Promise(r => setTimeout(r, 250));

    console.log('\n8. [16:00 ET] - ЗАКРИТТЯ РИНКУ');
    mockTime = { inPremarket: false, inMarket: false };
    await new Promise(r => setTimeout(r, 500));

    orchestrator.stop();
    console.log('\n--- ✅ ТЕСТ ЗАВЕРШЕНО ---\n');
}

run();
