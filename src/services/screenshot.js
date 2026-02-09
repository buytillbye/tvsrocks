import { chromium } from "playwright";
import fs from "fs/promises";
import sharp from "sharp";
import { createLogger } from "../core/logger.js";
import { createErrorHandler } from "../core/errorHandler.js";

/**
 * Singleton-like Screenshot Service that keeps browser open
 */
class PersistentScreenshotService {
    constructor(config) {
        this.config = config;
        this.logger = createLogger();
        this.errorHandler = createErrorHandler(this.logger);
        this.browser = null;
        this.context = null;
        this.isInitializing = false;

        // 🔄 Concurrency & Cache for Production
        this.pendingCaptures = new Map(); // Map<symbol:interval, Promise>
        this.cache = new Map();           // Map<symbol:interval, { path: string, timestamp: number }>
        this.CACHE_TTL = 10000;          // 10 seconds cache to avoid rapid duplicate captures
    }

    /**
     * Launch browser and context once
     */
    async ensureInitialized() {
        if (this.context) return;
        if (this.isInitializing) {
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isInitializing = true;
        try {
            this.logger.info('ScreenshotService', "🚀 Initializing persistent browser...");
            const { browserArgs, viewport } = this.config.screenshot;

            this.browser = await chromium.launch({
                headless: true,
                args: [
                    ...browserArgs,
                    '--disable-extensions',
                    '--disable-component-update',
                    '--no-pings',
                    '--mute-audio'
                ]
            });

            this.context = await this.browser.newContext({
                viewport: viewport,
                deviceScaleFactor: 1
            });

            this.logger.info('ScreenshotService', "✅ Persistent browser ready");
        } catch (error) {
            this.logger.error('ScreenshotService', `❌ Initialization failed: ${error.message}`);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    async captureOne(page, symbol, interval) {
        const encodedSymbol = encodeURIComponent(symbol);
        const url = `https://s.tradingview.com/widgetembed/?symbol=${encodedSymbol}&interval=${interval}&theme=dark&style=1&timezone=America%2FNew_York`;

        await page.goto(url, { waitUntil: 'load', timeout: 30000 });

        const chartSelector = '.chart-markup-table';
        const fallbackSelector = '.chart-gui-wrapper';

        try {
            await page.waitForSelector(chartSelector, { state: 'visible', timeout: 15000 });
        } catch (e) {
            await page.waitForSelector(fallbackSelector, { state: 'visible', timeout: 5000 });
        }

        // 🕒 Enable Extended Session (Pre/Post Market)
        let overridesSuccess = false;
        try {
            overridesSuccess = await page.evaluate(() => {
                const widget = window.tvWidget || (window.chartWidgetCollection && window.chartWidgetCollection.activeChartWidget && window.chartWidgetCollection.activeChartWidget.value());
                if (widget && typeof widget.applyOverrides === 'function') {
                    widget.applyOverrides({ "mainSeriesProperties.sessionId": "extended" });
                    return true;
                }
                return false;
            });
        } catch (e) { /* ignore */ }

        // Settle time for data to render
        await page.waitForTimeout(overridesSuccess ? 1500 : 800);

        const element = await page.$(chartSelector) || await page.$(fallbackSelector);
        if (element) {
            return await element.screenshot();
        } else {
            return await page.screenshot();
        }
    }

    /**
     * Captures a single chart screenshot with deduplication and caching (Buffer mode)
     */
    async capture(symbol, interval = "15") {
        const cacheKey = `${symbol}:${interval}`;

        // 1. Check Cache
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            return cached.buffer;
        }

        // 2. Check Pending (Deduplication)
        if (this.pendingCaptures.has(cacheKey)) {
            return this.pendingCaptures.get(cacheKey);
        }

        const capturePromise = (async () => {
            const t0 = Date.now();
            await this.ensureInitialized();
            const page = await this.context.newPage();

            try {
                await page.route('**/*', (route) => {
                    if (['image', 'media', 'font'].includes(route.request().resourceType())) {
                        route.abort();
                    } else {
                        route.continue();
                    }
                });

                this.logger.info('ScreenshotService', `📸 Capturing ${symbol} (${interval}) [Buffer mode]`);

                const buffer = await this.captureOne(page, symbol, interval);

                this.cache.set(cacheKey, { buffer, timestamp: Date.now() });
                this.logger.info('ScreenshotService', `✅ Captured ${symbol} in ${Date.now() - t0}ms`);

                return buffer;
            } catch (error) {
                this.logger.error('ScreenshotService', `❌ Capture failed for ${symbol}: ${error.message}`);
                return null;
            } finally {
                await page.close();
                this.pendingCaptures.delete(cacheKey);
            }
        })();

        this.pendingCaptures.set(cacheKey, capturePromise);
        return capturePromise;
    }

    /**
     * Captures 2x2 grid in parallel with deduplication (Buffer mode)
     */
    async captureStitched(symbol, intervals = ["D", "240", "15", "1"]) {
        const cacheKey = `${symbol}:STITCHED`;

        // 1. Check Cache
        const cached = this.cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL)) {
            return cached.buffer;
        }

        // 2. Check Pending
        if (this.pendingCaptures.has(cacheKey)) {
            return this.pendingCaptures.get(cacheKey);
        }

        const capturePromise = (async () => {
            const t0 = Date.now();
            await this.ensureInitialized();

            try {
                this.logger.info('ScreenshotService', `🎨 Generating asymmetric 2x2 grid for ${symbol}...`);

                const intervalsMap = [
                    { interval: "D", width: 800, height: 600, left: 0, top: 0 },
                    { interval: "240", width: 800, height: 600, left: 0, top: 600 },
                    { interval: "15", width: 1200, height: 600, left: 800, top: 0 },
                    { interval: "1", width: 1200, height: 600, left: 800, top: 600 }
                ];

                const captureResults = await Promise.all(intervalsMap.map(async (item) => {
                    const page = await this.context.newPage();
                    try {
                        // Set specific viewport for this interval
                        await page.setViewportSize({ width: item.width, height: item.height });

                        await page.route('**/*', (route) => {
                            if (['image', 'media', 'font'].includes(route.request().resourceType())) {
                                route.abort();
                            } else {
                                route.continue();
                            }
                        });
                        const buffer = await this.captureOne(page, symbol, item.interval);
                        return { buffer, ...item };
                    } finally {
                        await page.close();
                    }
                }));

                const finalWidth = 2000;
                const finalHeight = 1200;

                const stitchedBuffer = await sharp({
                    create: {
                        width: finalWidth,
                        height: finalHeight,
                        channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 1 }
                    }
                })
                    .composite(captureResults.map(res => ({
                        input: res.buffer,
                        left: res.left,
                        top: res.top
                    })))
                    .png()
                    .toBuffer();

                this.cache.set(cacheKey, { buffer: stitchedBuffer, timestamp: Date.now() });
                this.logger.info('ScreenshotService', `⚡ Asymmetric stitched ${symbol} in ${Date.now() - t0}ms`);

                return stitchedBuffer;
            } catch (error) {
                this.logger.error('ScreenshotService', `❌ Grid capture failed for ${symbol}: ${error.message}`);
                return null;
            } finally {
                this.pendingCaptures.delete(cacheKey);
            }
        })();

        this.pendingCaptures.set(cacheKey, capturePromise);
        return capturePromise;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.logger.info('ScreenshotService', "🧹 Browser closed");
        }
    }
}

// Global instance to persist across calls
let serviceInstance = null;

/**
 * Public function to capture a single ticker
 */
export async function captureTicker(ticker, config, interval = "15") {
    if (!serviceInstance) {
        serviceInstance = new PersistentScreenshotService(config);
    }
    return await serviceInstance.capture(ticker, interval);
}

/**
 * Public function to capture a 2x2 grid of intervals
 */
export async function captureStitchedTicker(ticker, config, intervals = ["D", "240", "15", "1"]) {
    if (!serviceInstance) {
        serviceInstance = new PersistentScreenshotService(config);
    }
    return await serviceInstance.captureStitched(ticker, intervals);
}

/**
 * Legacy support for the queue function
 */
export async function processTickerQueue(tickers, config, telegramService, interval = "15") {
    for (const ticker of tickers) {
        const imagePath = await captureTicker(ticker, config, interval);
        if (imagePath && telegramService?.sendPhoto) {
            await telegramService.sendPhoto(imagePath, `📊 *${ticker}* (${interval}m)\n#ScreenStonks`);
        }
    }
}

/**
 * Export for manual cleanup if needed
 */
export async function shutdownScreenshotService() {
    if (serviceInstance) {
        await serviceInstance.close();
        serviceInstance = null;
    }
}
