import { parseConfig, validateConfig } from '../src/config/index.js';
import { createTelegramService } from '../src/services/telegram.js';
import { captureTicker, shutdownScreenshotService } from '../src/services/screenshot.js';

async function runTest() {
    try {
        console.log('🔧 Loading real configuration and initializing services...');
        const config = validateConfig(parseConfig());
        const telegramService = createTelegramService(config);

        const ticker = process.argv[2] || "NASDAQ:TSLA";
        const interval = "15";

        const intervals = ["240", "15", "1"];
        const photoPaths = [];

        console.log(`🚀 Capturing real screenshots for ${ticker} (${intervals.join(', ')})...`);

        for (const interval of intervals) {
            const path = await captureTicker(ticker, config, interval);
            if (path) photoPaths.push({ path, interval });
        }

        if (photoPaths.length === 0) {
            throw new Error("Failed to capture any screenshots");
        }

        console.log('📤 Sending real Telegram messages for format verification...');

        // Mocked real-world data
        const stock = {
            symbol: ticker,
            rvol_intraday_5m: 5.25,
            close: 234.56,
            change: 4.20,
            float_shares_outstanding: 2800000000,
            volume: 45000000,
            premarket_change: 1.50
        };

        const prefix = "🚀 *RVOL SURGE TEST ALERT*";
        const message = `${prefix}\n\n` +
            `Ticker: \`${stock.symbol}\`\n` +
            `RVOL 5m: *${stock.rvol_intraday_5m.toFixed(2)}x*\n` +
            `Price: *$${stock.close.toFixed(2)}*\n` +
            `Change: *${stock.change.toFixed(2)}%*\n` +
            `Float: *${(stock.float_shares_outstanding / 1000000).toFixed(2)}M*\n` +
            `Volume: *${(stock.volume / 1000000).toFixed(2)}M*\n` +
            `Premarket: *${stock.premarket_change.toFixed(2)}%*\n\n` +
            `_Це тестове повідомлення для перевірки компактності (800x600)._`;

        for (let i = 0; i < photoPaths.length; i++) {
            const { path, interval } = photoPaths[i];
            const caption = i === 0 ? message : `📊 *${ticker}* (${interval === "240" ? "4H" : interval + "m"})`;
            const result = await telegramService.sendPhoto(path, caption);

            if (result.success) {
                console.log(`✅ Message ${i + 1} sent successfully!`);
            } else {
                console.log(`❌ Failed to send message ${i + 1}:`, result.error.message);
            }
        }

        console.log('\n🧹 Shutting down screenshot service...');
        await shutdownScreenshotService();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    }
}

runTest();
