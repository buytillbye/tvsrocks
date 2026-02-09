import { captureStitchedTicker, shutdownScreenshotService } from '../src/services/screenshot.js';
import { parseConfig, validateConfig } from '../src/config/index.js';
import { createTelegramService } from '../src/services/telegram.js';

async function runStitchTest() {
    try {
        console.log('🧪 Starting 2x2 Stitched Screenshot Test (1D, 4H, 15m, 1m)...');
        const config = validateConfig(parseConfig());
        const telegramService = createTelegramService(config);

        const ticker = process.argv[2] || "NASDAQ:TSLA";
        const intervals = ["D", "240", "15", "1"];

        console.log(`🚀 Capturing stitched grid for ${ticker}...`);
        const t0 = Date.now();
        const buffer = await captureStitchedTicker(ticker, config, intervals);

        if (buffer && Buffer.isBuffer(buffer)) {
            console.log(`✅ Stitched Success in ${Date.now() - t0}ms, size: ${buffer.length} bytes`);

            const message = `🚀 *BUFFER MODE TEST*\n\n` +
                `Ticker: \`${ticker}\`\n` +
                `Status: Zero-Disk Capture\n` +
                `Layout: 2x2 Grid (1D, 4H, 15m, 1m)\n\n` +
                `_Фото надіслано напряму з пам'яті (Buffer)._`;

            await telegramService.sendPhoto(buffer, message);
            console.log('📤 Message sent to Telegram!');
        } else {
            console.log('❌ Failed to create stitched image buffer');
        }

        console.log('\n🧹 Cleaning up...');
        await shutdownScreenshotService();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

runStitchTest();
