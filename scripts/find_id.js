
import fetch from 'node-fetch';
import 'dotenv/config';

const token = process.env.BOT_TOKEN;

async function findId() {
    console.log('--- Searching for recent messages to the bot ---');
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
        const data = await response.json();

        if (!data.ok) {
            console.error('Error from Telegram:', data.description);
            return;
        }

        const updates = data.result;
        if (updates.length === 0) {
            console.log('No recent messages found. Please send a message to your bot first!');
            return;
        }

        console.log('Found recent activity:');
        updates.forEach(update => {
            const msg = update.message || update.channel_post || update.my_chat_member;
            if (msg) {
                const chat = msg.chat || msg.from;
                const type = msg.chat ? msg.chat.type : 'unknown';
                console.log(`- [${type}] Name: ${chat.first_name || chat.title || 'Unknown'}, ID: ${chat.id}`);
            }
        });
    } catch (error) {
        console.error('Failed to fetch updates:', error.message);
    }
}

findId();
