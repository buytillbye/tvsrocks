import { captureStitchedTicker, shutdownScreenshotService } from '../src/services/screenshot.js';
import { parseConfig, validateConfig } from '../src/config/index.js';
import { createTelegramService } from '../src/services/telegram.js';

async function runDedupTest() {
    try {
        console.log('🧪 Starting Deduplication & Cache Test...');
        const config = validateConfig(parseConfig());
        const telegramService = createTelegramService(config);

        const ticker = "NASDAQ:AAPL";

        console.log(`🚀 Triggering 3 CONCURRENT requests for ${ticker}...`);

        const t0 = Date.now();
        // Trigger 3 calls at the same time
        const results = await Promise.all([
            captureStitchedTicker(ticker, config),
            captureStitchedTicker(ticker, config),
            captureStitchedTicker(ticker, config)
        ]);

        const dt = Date.now() - t0;
        console.log(`\n📊 Test Results after ${dt}ms:`);
        results.forEach((path, i) => {
            console.log(`   Result #${i + 1}: ${path ? '✅ Success' : '❌ Failed'}`);
        });

        console.log('\n🧹 Cleaning up...');
        await shutdownScreenshotService();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

runDedupTest();
