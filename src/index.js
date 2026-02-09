/**
 * @fileoverview Main application entry point for stock watcher
 * Functional Stocks 10%+ watcher → TG notifications (ESM) + авто-режим премаркету (ET 04:00–09:30)
 */
import { parseConfig, validateConfig } from "./config/index.js";
import { maskToken } from "./core/utils/index.js";
import { createTelegramService } from "./services/telegram.js";
import { createScanner } from "./services/scanner.js";
import { createRvolService } from "./services/rvolService.js";
import { createOrchestrator } from "./core/orchestrator.js";
import { createLogger } from "./core/logger.js";
import { createGlobalErrorHandler, ConfigurationError } from "./core/errorHandler.js";
import { validateConfig as validateConfigData } from "./config/validation.js";

/**
 * Creates the main application instance
 * @returns {Promise<Object>} Application instance
 */
const createApp = async () => {
    const logger = createLogger();

    try {
        // Parse and validate configuration
        const rawConfig = parseConfig();
        const configValidation = validateConfigData(rawConfig);

        if (!configValidation.isValid) {
            throw new ConfigurationError(
                `Configuration validation failed: ${configValidation.errors.join(', ')}`
            );
        }

        const config = validateConfig(rawConfig);

        logger.info('App', `CFG → BOT_TOKEN: ${maskToken(config.botToken)}, CHAT_ID: ${config.chatId}, THREAD_ID: ${config.threadId}`);

        const telegramService = createTelegramService(config);
        const growthScanner = createScanner(config, telegramService);
        const rvolScanner = createRvolService(config, telegramService);
        const orchestrator = createOrchestrator(config, { growthScanner, rvolScanner });
        const globalErrorHandler = createGlobalErrorHandler(telegramService, logger);

        return Object.freeze({
            start: async () => {
                logger.info('App', "=== Stocks10 watcher (premarket auto) стартує ===");

                await telegramService.initialize();

                const launchPromise = telegramService.launch()
                    .catch(err => {
                        logger.error('App', `Telegraf launch failed: ${err?.response?.description || err.message}`);
                        throw err;
                    });

                orchestrator.start();

                // Wait for launch to complete
                await launchPromise;

                logger.info('App', "Application started successfully");
            },
            shutdown: async () => {
                await orchestrator.stop();
                if (growthScanner.shutdown) await growthScanner.shutdown();
            },
            sendErrorMessage: telegramService.sendMessage,
            handleGlobalError: globalErrorHandler
        });
    } catch (error) {
        logger.error('App', `Failed to create application: ${error.message}`);
        throw error;
    }
};

/**
 * Handles fatal application errors
 * @param {Object} app - Application instance
 * @param {Error} error - Fatal error
 * @returns {Promise<void>}
 */
const handleFatalError = async (app, error) => {
    const logger = createLogger();
    logger.error('App', `Fatal error: ${error.message}`, {
        stack: error.stack,
        name: error.name
    });

    try {
        await app.sendErrorMessage(`❌ Fatal: ${error.message || error}`);
    } catch (notificationError) {
        logger.error('App', `Failed to send fatal error notification: ${notificationError.message}`);
    }

    process.exit(1);
};

/**
 * Sets up graceful shutdown handlers
 * @param {Object} app - Application instance
 * @returns {void}
 */
const setupGracefulShutdown = (app) => {
    const logger = createLogger();

    const shutdown = async (signal) => {
        logger.info('App', `Received ${signal}, shutting down gracefully...`);

        try {
            await app.shutdown();
            logger.info('App', 'Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('App', `Error during shutdown: ${error.message}`);
            process.exit(1);
        }
    };

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', async (error) => {
        await app.handleGlobalError(error, { component: 'Process', type: 'uncaughtException' });
        await handleFatalError(app, error);
    });

    process.on('unhandledRejection', async (reason, promise) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        await app.handleGlobalError(error, { component: 'Process', type: 'unhandledRejection', promise });
        await handleFatalError(app, error);
    });
};

/**
 * Main application bootstrap function
 * @returns {Promise<void>}
 */
const main = async () => {
    const logger = createLogger();

    try {
        const app = await createApp();
        setupGracefulShutdown(app);
        await app.start();
    } catch (error) {
        logger.error('App', `Failed to start application: ${error.message}`, {
            stack: error.stack,
            name: error.name
        });
        process.exit(1);
    }
};

// Start the application with enhanced error handling
main().catch(async (error) => {
    const logger = createLogger();
    logger.error('App', `Unhandled error in main: ${error.message}`, {
        stack: error.stack,
        name: error.name
    });
    process.exit(1);
});
