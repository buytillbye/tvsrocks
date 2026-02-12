
import { parseConfig, validateConfig } from '../src/config/index.js';
import { createTelegramService } from '../src/services/telegram.js';

async function test() {
    try {
        const config = validateConfig(parseConfig());
        const telegram = createTelegramService(config);
        const text = process.argv[2] || 'Test message';

        console.log(`Sending to ID ${config.chatId}...`);
        await telegram.sendMessage(text);
        console.log('✅ Send successful!');
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }
}
test();
