import { processTickerQueue } from '../src/services/screenshot.js';
import { parseConfig, validateConfig } from '../src/config/index.js';

// Mock Telegram Service
const mockTelegramService = {
    sendPhoto: async (imagePath, caption) => {
        console.log(`📸 [MOCK TG] Sending photo: ${imagePath}`);
        console.log(`📝 Caption: ${caption}`);
        console.log('✅ Photo "sent" successfully (saved locally)');
    },
    sendMessage: async (msg) => {
        console.log(`📝 [MOCK TG] Sending message: ${msg}`);
    }
};

async function runTest() {
    try {
        console.log('🔧 Loading configuration...');
        const config = validateConfig(parseConfig());

        const ticker = process.argv[2] || "NASDAQ:TSLA";
        const interval = process.argv[3] || "15";

        console.log(`🚀 Starting persistent screenshot test for: ${ticker} (${interval}m)`);
        const t1 = Date.now();
        await processTickerQueue([ticker], config, mockTelegramService, interval);
        console.log(`⏱️ First capture took: ${Date.now() - t1}ms`);

        console.log(`\n🚀 Starting second capture (should use persistent browser)...`);
        const t2 = Date.now();
        await processTickerQueue([ticker], config, mockTelegramService, interval);
        console.log(`⏱️ Second capture took: ${Date.now() - t2}ms`);

        console.log('\n✅ Test completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

runTest();
