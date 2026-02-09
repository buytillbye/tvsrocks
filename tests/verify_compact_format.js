import { createStartupMessage } from '../src/core/utils/format.js';

const config = {
    premarketThreshold: 15,
    scanIntervalMs: 5000,
    premarketAlertStep: 15.0,
    rvolThreshold: 3.0,
    rvolAlertStep: 2.0,
    sendOnStartup: false
};

console.log('\n--- 🧪 VERIFYING STARTUP MESSAGE ---\n');
const msg = createStartupMessage(config);
console.log(msg);
console.log('\n-----------------------------------\n');

const lines = msg.split('\n');
if (lines.length === 4) { // Name + Pre + Mkt + optional empty/trailing
    console.log('✅ Message has compact layout');
} else {
    console.log(`ℹ️ Message has ${lines.length} lines`);
}

if (msg.includes('ScreenStonks Bot')) {
    console.log('✅ Bot name updated to ScreenStonks');
} else {
    console.log('❌ Bot name NOT updated');
}
