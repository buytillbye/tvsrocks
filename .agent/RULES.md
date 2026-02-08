# 🤖 AI Agent Rules for Stocks10 Project

## Project Overview

Stocks10 Premarket Watcher — Node.js application for monitoring US stock market premarket activity. Uses TradingView Scanner API and sends notifications via Telegram.

## ⚠️ Critical Files - DO NOT MODIFY

### `tvClient.js`
> **НЕ ЧІПАТИ без крайньої потреби!**

This file contains browser-like headers and specific request structure for TradingView API. Any changes may result in:
- Rate limiting (429)
- Complete blocking (403)
- Invalid responses

**Only modify if:**
- TradingView changes their API
- Adding new columns to fetch
- Must test thoroughly before deployment

## 📁 Project Structure Rules

### Module Responsibilities

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| `app.js` | Entry point, bootstrap | All services |
| `config.js` | Parse & validate config | dotenv |
| `scannerService.js` | Scheduler, gatekeeper | stockService, telegramService |
| `stockService.js` | Data processing | tvClient, telegramService |
| `telegramService.js` | Notifications | telegraf |
| `tvClient.js` | TradingView API | None |
| `screenshot-service.js` | Chart screenshots | playwright, sharp |
| `logger.js` | Centralized logging | utils/time |
| `errorHandler.js` | Error classes & handling | logger |
| `validation.js` | Data validation | None |

### Utils Organization

```
utils/
├── time.js     # Time/timezone functions (NY time)
├── format.js   # Message & number formatting
├── state.js    # Immutable state manager
└── hof.js      # Higher-order functions (retry, logging)
```

**Rule:** Keep utils pure and without side effects.

## 🎯 Code Style Guidelines

### 1. Functional Programming Pattern
- Use factory functions (e.g., `createScanner`, `createLogger`)
- Return frozen objects (`Object.freeze`)
- Avoid class syntax (exception: `screenshot-service.js`)
- Prefer pure functions

### 2. Error Handling
```javascript
// Use custom error classes
import { TelegramError, TradingViewError } from './errorHandler.js';

// Wrap functions with error handler
const wrappedFn = errorHandler.wrapAsync(asyncFn, {
  component: 'ComponentName',
  operation: 'operationName'
});
```

### 3. Logging Convention
```javascript
const logger = createLogger();

// Component-specific logging
logger.info('ComponentName', 'message', { extra: 'data' });

// Use specialized loggers
logger.telegram.sent(messageId, chatId, threadId);
logger.tradingview.success(duration, count, rows);
logger.scanner.newStock(symbol, change);
```

### 4. State Management
```javascript
const stateManager = createStateManager({
  isRunning: false,
  data: []
});

// Update immutably
stateManager.update(() => ({ isRunning: true }));

// Get current state (frozen)
const state = stateManager.get();
```

## 🔧 Configuration Rules

### Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BOT_TOKEN` | ✅ Yes | - | Telegram bot token |
| `CHAT_ID` | ✅ Yes | - | Telegram chat/group ID |
| `THREAD_ID` | ❌ No | null | Telegram topic thread ID |
| `PREMARKET_THRESHOLD` | ❌ No | 10 | Min % change filter |
| `SCAN_INTERVAL_MS` | ❌ No | 10000 | Scan interval (ms) |
| `SEND_ON_STARTUP` | ❌ No | false | Send notifications on first scan |

### Timeouts Configuration
All timeouts are defined in `config.js`:
```javascript
timeouts: {
  launchTimeoutMs: 15000,      // Telegram launch
  fetchTimeoutMs: 30000,       // API requests
  retryDelayMs: 2000,          // Base retry delay
  shutdownGraceMs: 1000,       // Graceful shutdown
  gatekeeperIntervalMs: 30000  // Premarket check
}
```

## 🚫 Anti-Patterns to Avoid

1. **Don't mutate frozen objects**
   ```javascript
   // ❌ Bad
   const state = stateManager.get();
   state.isRunning = true;
   
   // ✅ Good
   stateManager.update(() => ({ isRunning: true }));
   ```

2. **Don't use console.log directly in services**
   ```javascript
   // ❌ Bad
   console.log('message');
   
   // ✅ Good
   logger.info('Component', 'message');
   ```

3. **Don't hardcode magic numbers**
   ```javascript
   // ❌ Bad
   setTimeout(fn, 30000);
   
   // ✅ Good
   const timeout = config.timeouts?.gatekeeperIntervalMs || 30000;
   setTimeout(fn, timeout);
   ```

4. **Don't ignore validation**
   ```javascript
   // ❌ Bad
   const msg = await telegramService.sendMessage(text);
   
   // ✅ Good
   const validation = validateTelegramMessage(text, chatId, threadId);
   if (!validation.isValid) throw new TelegramError(...);
   ```

## 📊 TradingView API Rules

### Request Structure
```javascript
{
  columns: COLUMNS,  // Fixed, do not change order
  filter: [...],     // Basic filters
  filter2: {...},    // Complex filters (type/subtype)
  range: [0, 100],   // Max 100 results
  sort: { sortBy: "premarket_change", sortOrder: "desc" },
  markets: ["america"]
}
```

### Stock Filtering Logic
1. API filters: volume > 50k, change > threshold, price >= $0.80
2. Code filter: `float_shares_outstanding <= 15,000,000` OR null
3. Dedup: Skip if symbol in `seenSymbols`
4. First scan: Suppress notifications (unless `SEND_ON_STARTUP=true`)

## 🧪 Testing Considerations

### When adding new features:
1. Test during actual premarket hours (04:00-09:30 ET)
2. Test with `SEND_ON_STARTUP=true` to see immediate results
3. Monitor for rate limiting (429 errors)
4. Check Telegram delivery confirmation

### Mock-friendly modules:
- `telegramService` - can mock for tests
- `tvClient` - can mock API responses
- `utils/time` - can mock NY time for testing

## 🚀 Deployment Checklist

1. ✅ Check `.env` variables
2. ✅ Verify `BOT_TOKEN` and `CHAT_ID`
3. ✅ Test Telegram bot permissions in target chat
4. ✅ Check timezone (must support America/New_York)
5. ✅ Verify Node.js >= 18.0.0
6. ✅ For screenshots: Playwright browsers installed

## 📝 Commit Message Convention

```
feat(scanner): add new filter for market cap
fix(telegram): handle thread fallback properly
refactor(utils): split time utilities  
docs: update README with new configuration
chore: update dependencies
```

## 🔄 Common Tasks

### Adding new stock filter
1. Modify `filter` array in `tvClient.js` getStocks10()
2. Or add code filter in `stockService.js` filterNewStocks()
3. Update validation in `validation.js` if needed

### Adding new notification field
1. Add column to `COLUMNS` in `tvClient.js`
2. Update `mapRow()` to extract the value
3. Update `createStockMessage()` in `utils/format.js`
4. Update `validateStockData()` in `validation.js`

### Changing premarket hours
1. Modify `premarketHours` in `config.js`
2. No other changes needed (gatekeeper uses config)
