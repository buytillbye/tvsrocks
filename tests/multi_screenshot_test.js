import { captureTicker, shutdownScreenshotService } from '../src/services/screenshot.js';
import { parseConfig, validateConfig } from '../src/config/index.js';

// Mock Telegram if needed, but the user wants to "see" them, so probably real TG or I'll just save them
const mockTelegramService = {
    sendPhoto: async (imagePath, caption) => {
        console.log(`\n📸 [MOCK TG] Photo: ${imagePath}`);
        console.log(`📝 Caption: ${caption.split('\n')[0]}`);
    }
};

async function runMultiTest() {
    try {
        console.log('🧪 Starting Multi-Interval Compact Screenshot Test...');
        const config = validateConfig(parseConfig());

        const ticker = process.argv[2] || "NASDAQ:TSLA";
        const intervals = ["240", "15", "1"];

        console.log(`🚀 Views to capture: ${intervals.join(', ')}`);

        for (const interval of intervals) {
            console.log(`\n📸 Capturing ${ticker} (${interval})...`);
            const t0 = Date.now();
            const path = await captureTicker(ticker, config, interval);
            if (path) {
                console.log(`✅ Success in ${Date.now() - t0}ms: ${path}`);
            } else {
                console.log(`❌ Failed to capture ${interval}`);
            }
        }

        console.log('\n🧹 Cleaning up...');
        await shutdownScreenshotService();
        console.log('✅ Test finished. Check the /screenshots folder for 800x600 images.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

runMultiTest();
