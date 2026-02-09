/**
 * @fileoverview Telegram bot service for sending messages
 */
import { Telegraf } from "telegraf";
import { withLogging, withRetry } from "../core/utils/index.js";
import { createLogger } from "../core/logger.js";
import { createErrorHandler, TelegramError } from "../core/errorHandler.js";
import { validateTelegramMessage } from "../config/validation.js";

/**
 * Creates Telegram service with enhanced logging and error handling
 * @param {Object} config - Configuration object
 * @returns {Object} Telegram service instance
 */
export const createTelegramService = (config) => {
    const logger = createLogger();
    const errorHandler = createErrorHandler(logger);
    const bot = new Telegraf(config.botToken);

    /**
     * Creates send options with optional thread support
     * @param {boolean} useThread - Whether to use thread ID
     * @returns {Object} Telegram send options
     */
    const createSendOptions = (useThread) => {
        const baseOpts = { disable_web_page_preview: true };
        return useThread && config.threadId
            ? { ...baseOpts, message_thread_id: config.threadId }
            : baseOpts;
    };

    /**
     * Attempts to send message with given options
     * @param {string} text - Message text
     * @param {Object} options - Send options
     * @returns {Promise<Object>} Telegram message response
     */
    const trySendMessage = (text, options) =>
        bot.telegram.sendMessage(config.chatId, String(text), options);

    /**
     * Sends message with validation and error handling
     * @param {string} text - Message text to send
     * @returns {Promise<Object>} Send result
     */
    const sendMessage = async (text) => {
        // Validate message parameters
        const validation = validateTelegramMessage(text, config.chatId, config.threadId);
        if (!validation.isValid) {
            const error = new TelegramError(`Validation failed: ${validation.errors.join(', ')}`);
            errorHandler.handle(error, {
                component: 'TelegramService',
                operation: 'sendMessage',
                metadata: { text: text?.substring(0, 50) }
            });
            throw error;
        }

        try {
            const opts = createSendOptions(true);
            const msg = await trySendMessage(text, opts);

            logger.telegram.sent(msg.message_id, msg.chat.id, config.threadId);
            return { success: true, message: msg };
        } catch (error) {
            return await handleSendError(error, text);
        }
    };

    /**
     * Handles send errors with retry logic
     * @param {Error} error - Original error
     * @param {string} text - Message text
     * @returns {Promise<Object>} Retry result
     */
    const handleSendError = async (error, text) => {
        const code = error?.response?.error_code;
        const desc = error?.response?.description || error.message;

        logger.telegram.error(code, desc);

        if (config.threadId && code === 400) {
            logger.telegram.retry();
            try {
                const msg = await trySendMessage(text, createSendOptions(false));
                logger.telegram.sent(msg.message_id, msg.chat.id, null);
                return { success: true, message: msg };
            } catch (retryError) {
                const retryDesc = retryError?.response?.description || retryError.message;
                logger.telegram.retryFailed(retryDesc);

                const telegramError = new TelegramError(
                    `Send failed after retry: ${retryDesc}`,
                    retryError?.response?.error_code,
                    retryDesc
                );
                errorHandler.handle(telegramError, {
                    component: 'TelegramService',
                    operation: 'handleSendError',
                    metadata: { originalCode: code, retryCode: retryError?.response?.error_code }
                });
            }
        }

        return { success: false, error };
    };

    /**
     * Initializes Telegram bot and validates connection
     * @returns {Promise<Object>} Bot information
     */
    const initialize = async () => {
        try {
            const me = await bot.telegram.getMe();
            logger.info('TelegramService', `✓ Telegram OK, bot: @${me.username}`);
            return me;
        } catch (error) {
            const telegramError = new TelegramError(`Failed to initialize: ${error.message}`);
            errorHandler.handle(telegramError, {
                component: 'TelegramService',
                operation: 'initialize'
            });
            throw telegramError;
        }
    };

    /**
     * Launches bot with timeout handling
     * @returns {Promise<void>}
     */
    const launch = () => {
        return bot.launch()
            .then(() => {
                logger.info('TelegramService', "✓ Telegraf launched (long polling)");
            })
            .catch(error => {
                const telegramError = new TelegramError(`Launch failed: ${error.message}`);
                errorHandler.handle(telegramError, {
                    component: 'TelegramService',
                    operation: 'launch'
                });
                throw telegramError;
            });
    };

    /**
     * Stops the bot gracefully
     * @param {string} reason - Stop reason
     * @returns {Promise<void>}
     */
    const stop = (reason = "SIGINT") => {
        logger.info('TelegramService', `Stopping bot: ${reason}`);
        return bot.stop(reason);
    };

    return Object.freeze({
        sendMessage: errorHandler.wrapAsync(sendMessage, {
            component: 'TelegramService',
            operation: 'sendMessage'
        }),
        onCommand: (command, handler) => {
            bot.command(command, async (ctx) => {
                try {
                    // Security: only allow commands from the configured chatId
                    if (ctx.chat.id !== config.chatId) {
                        logger.warn('TelegramService', `Ignored command from unauthorized chat: ${ctx.chat.id}`);
                        return;
                    }
                    await handler(ctx);
                } catch (error) {
                    errorHandler.handle(error, {
                        component: 'TelegramService',
                        operation: 'commandHandler',
                        metadata: { command }
                    });
                }
            });
        },
        initialize: withRetry(
            errorHandler.wrapAsync(initialize, {
                component: 'TelegramService',
                operation: 'initialize'
            }),
            config.retry.maxAttempts
        ),
        launch: errorHandler.wrapAsync(launch, {
            component: 'TelegramService',
            operation: 'launch'
        }),
        stop
    });
};
