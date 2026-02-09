import { parseConfig, validateConfig } from '../src/config/index.js';
import { createTelegramService } from '../src/services/telegram.js';
import { captureTicker, shutdownScreenshotService } from '../src/services/screenshot.js';

async function runStressTest() {
    try {
        console.log('🧪 Starting 1-minute Real Telegram Stress Test...');
        const config = validateConfig(parseConfig());
        const telegramService = createTelegramService(config);

        const tickers = ["NASDAQ:TSLA", "NASDAQ:AAPL", "NASDAQ:NVDA"];
        const interval = "15";

        for (let i = 0; i < tickers.length; i++) {
            const ticker = tickers[i];
            console.log(`\n🚀 [${i + 1}/${tickers.length}] Processing ${ticker}...`);

            const tStart = Date.now();
            const imagePath = await captureTicker(ticker, config, interval);
            const tCapture = Date.now() - tStart;

            if (imagePath) {
                console.log(`📸 Captured in ${tCapture}ms. Sending to Telegram...`);

                const message = `🚀 *RVOL STRESS TEST* (${i + 1}/${tickers.length})\n\n` +
                    `Ticker: \`${ticker}\`\n` +
                    `RVOL 5m: *${(5 + i * 1.5).toFixed(2)}x*\n` +
                    `Status: *Integration Test Run*\n\n` +
                    `#StressTest #Stonks`;

                await telegramService.sendPhoto(imagePath, message);
                console.log(`✅ Sent message for ${ticker}`);
            } else {
                console.log(`❌ Failed to capture for ${ticker}`);
            }

            if (i < tickers.length - 1) {
                console.log('⏳ Waiting 20 seconds before next capture...');
                await new Promise(resolve => setTimeout(resolve, 20000));
            }
        }

        console.log('\n🧹 Shutting down screenshot service...');
        await shutdownScreenshotService();
        console.log('\n✅ Real Telegram Stress Test completed!');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

runStressTest();
