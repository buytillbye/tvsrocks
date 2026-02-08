# Stocks10 Premarket Watcher

A functional stock monitoring application that tracks NASDAQ/NYSE stocks with 10%+ premarket change and notifies via Telegram.

## Project Structure

```text
tvstocks/
├── src/
│   ├── config/          # Configuration and validation
│   │   ├── index.js
│   │   └── validation.js
│   ├── core/            # Core utilities and infrastructure
│   │   ├── utils/       # Modular utility functions
│   │   │   ├── format.js
│   │   │   ├── hof.js
│   │   │   ├── index.js
│   │   │   ├── state.js
│   │   │   └── time.js
│   │   ├── errorHandler.js
│   │   └── logger.js
│   ├── services/        # Application services
│   │   ├── scanner.js
│   │   ├── screenshot.js
│   │   ├── stock.js
│   │   ├── telegram.js
│   │   └── tradingview.js
│   └── index.js         # Main entry point
├── .env                 # Environment variables
├── Dockerfile           # Container configuration
├── fly.toml             # Deployment configuration
└── package.json         # Node.js dependencies and scripts
```

## Setup

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure environment**:
    Create a `.env` file with the following:
    ```env
    BOT_TOKEN=your_telegram_bot_token
    CHAT_ID=your_telegram_chat_id
    THREAD_ID=your_thread_id (optional)
    PREMARKET_THRESHOLD=10 (optional, default 10)
    SCAN_INTERVAL_MS=10000 (optional, default 10000)
    SEND_ON_STARTUP=false (optional, default false)
    ```

## Usage

### Local Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Docker
```bash
docker build -t stocks10-watcher .
docker run --env-file .env stocks10-watcher
```

## Features

-   **Modular Architecture**: Clean separation of concerns with `src/` directory.
-   **Automated Monitoring**: Automatically starts during NY premarket hours (04:00–09:30 ET).
-   **Telegram Integration**: Real-time notifications for breakthrough stocks.
-   **Robust Error Handling**: Centralized error management and graceful shutdown.
-   **Structured Logging**: Detailed component-based logs.

## License
MIT
