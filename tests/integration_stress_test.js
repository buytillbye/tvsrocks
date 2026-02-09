import { createRvolService } from '../src/services/rvolService.js';
import { parseConfig, validateConfig } from '../src/config/index.js';
import { shutdownScreenshotService } from '../src/services/screenshot.js';

// 1. Mock Telegram Service
const mockTelegramService = {
    sendPhoto: async (imagePath, caption) => {
        console.log(`\n📸 [MOCK TG] 🟢 PHOTO SENT: ${imagePath}`);
        console.log(`📝 [MOCK TG] Caption: ${caption.split('\n')[0]}...`);
    },
    sendMessage: async (msg) => {
        console.log(`\n📝 [MOCK TG] 🔵 MESSAGE SENT: ${msg.split('\n')[0]}...`);
    }
};

// 2. Mock TV Scanner to rotate tickers
let cycle = 0;
const mockScanner = {
    getRvolSurgeStocks: async (config, threshold) => {
        cycle++;
        // Simulate different tickers every few cycles
        const mockData = [
            { s: "NASDAQ:TSLA", d: [0, 0, 0, 0, 0, 0, 5.5, 10000000, 200, 0, 0, 0, 0, 5.0, 50000000, 0, 100000000, 0, 10] },
            { s: "NASDAQ:AAPL", d: [0, 0, 0, 0, 0, 0, 4.2, 5000000, 250, 0, 0, 0, 0, 2.0, 100000000, 0, 200000000, 0, 5] }
        ];

        // Every 3 cycles add a new one
        if (cycle > 5) {
            mockData.push({ s: "NASDAQ:NVDA", d: [0, 0, 0, 0, 0, 0, 8.1, 20000000, 700, 0, 0, 0, 0, 3.5, 200000000, 0, 300000000, 0, 12] });
        }

        // Increase RVOL to trigger "GROWTH" updates
        mockData.forEach(s => {
            s.d[6] += (cycle * 0.5); // Increase rvol_intraday_5m
        });

        return { data: mockData, totalCount: mockData.length };
    }
};

async function runIntegrationTest() {
    try {
        console.log('🧪 Starting 1-minute Integration Stress Test...');
        const config = validateConfig(parseConfig());

        // Override intervals for faster testing
        const testConfig = {
            ...config,
            rvolIntervalMs: 5000, // Scan every 5 seconds
            rvolAlertStep: 1.0     // Alert every 1.0 rvol growth
        };

        const rvolService = createRvolService(testConfig, mockTelegramService, mockScanner);

        console.log('🚀 Starting RvolService...');
        await rvolService.start();

        // Run for 60 seconds
        let remaining = 60;
        const timer = setInterval(() => {
            remaining -= 5;
            if (remaining > 0) {
                console.log(`⏳ Test running... ${remaining}s left`);
            }
        }, 5000);

        await new Promise(resolve => setTimeout(resolve, 60000));

        clearInterval(timer);
        console.log('\n🛑 Stopping RvolService...');
        rvolService.stop();

        console.log('🧹 Shutting down Screenshot Service...');
        await shutdownScreenshotService();

        console.log('\n✅ Integration Stress Test completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

runIntegrationTest();
