/**
 * @fileoverview Screenshot service using Playwright to capture TradingView charts
 */
import { chromium } from "playwright";
import fs from "fs/promises";
import sharp from 'sharp';
import { createLogger } from "../core/logger.js";
import { createErrorHandler } from "../core/errorHandler.js";

/**
 * Screenshot service class for capturing and processing stock charts
 */
class ScreenshotService {
    /**
     * @param {Object} config - Application configuration
     * @param {Object} telegramService - Telegram service for sending results
     */
    constructor(config, telegramService) {
        this.config = config;
        this.telegramService = telegramService;
        this.browser = null;
        this.page = null;
        this.logger = createLogger();
        this.errorHandler = createErrorHandler(this.logger);
        this.tickerQueue = [];
        this.isInitialSetupComplete = false;
    }

    /**
     * Initializes the browser with configured arguments and dark mode
     */
    async initBrowser() {
        this.logger.info('ScreenshotService', "🚀 Initializing browser...");
        const { browserArgs, viewport } = this.config.screenshot;

        this.browser = await chromium.launch({
            headless: true,
            args: [...browserArgs]
        });

        this.page = await this.browser.newPage();

        // Set dark mode cookie for TradingView
        await this.page.context().addCookies([{
            name: 'theme',
            value: 'dark',
            domain: '.tradingview.com',
            path: '/',
            expires: Math.floor(Date.now() / 1000) + 86400
        }]);

        await this.page.setViewportSize(viewport);

        // Block unnecessary resources for speed
        await this.page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (this.config.screenshot.blockedResources.includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        this.logger.info('ScreenshotService', "✅ Browser initialized with dark theme");
    }

    async navigateToChart() {
        this.logger.info('ScreenshotService', "🌐 Navigating to TradingView chart...");
        await this.page.goto('https://www.tradingview.com/chart/', {
            waitUntil: 'domcontentloaded',
            timeout: this.config.timeouts.fetchTimeoutMs / 2
        });
        await this.page.waitForSelector('#header-toolbar-symbol-search', { timeout: 8000 });
        this.logger.info('ScreenshotService', "✅ TradingView loaded");
    }

    async searchSymbol(symbol) {
        this.logger.info('ScreenshotService', `🔍 Searching for ${symbol}...`);
        await this.page.click('#header-toolbar-symbol-search');
        await this.page.waitForSelector('input[data-role="search"]', { timeout: 2000 });
        await this.page.fill('input[data-role="search"]', '');
        await this.page.fill('input[data-role="search"]', symbol);
        await this.page.press('input[data-role="search"]', 'Enter');
        await this.page.waitForSelector('.chart-container', { timeout: 5000 });
        this.logger.info('ScreenshotService', `✅ ${symbol} loaded`);
    }

    async selectTimeInterval(interval) {
        this.logger.info('ScreenshotService', `⏱️ Setting interval: ${interval}`);
        try {
            await this.page.click('#header-toolbar-intervals button');
            await this.page.waitForTimeout(200);
            await this.page.click(`div[data-value="${interval}"][data-role="menuitem"]`);
            await this.page.waitForTimeout(300);
        } catch (e) {
            this.logger.warn('ScreenshotService', `Interval selection failed for ${interval}, continuing...`);
        }
    }

    async switchToExtendedHours() {
        this.logger.info('ScreenshotService', "⏰ Enabling Extended Hours...");
        try {
            await this.page.click('button[data-name="session-menu"]');
            await this.page.waitForTimeout(200);
            await this.page.click('div[data-role="menuitem"]:has-text("Extended trading hours")');
            await this.page.waitForTimeout(300);
        } catch (e) {
            this.logger.warn('ScreenshotService', "Extended Hours switch failed, continuing...");
        }
    }

    async zoomOutChart() {
        try {
            const chartElement = await this.page.$('.chart-container.single-visible');
            await chartElement.hover();
            for (let i = 0; i < 3; i++) {
                await this.page.mouse.wheel(0, 500);
            }
        } catch (e) {
            this.logger.warn('ScreenshotService', "Zoom out failed, continuing...");
        }
    }

    async closeZoomTooltip() {
        try {
            await this.page.waitForSelector('.closeButton-zLVm6B4t', { timeout: 500 });
            await this.page.click('.closeButton-zLVm6B4t');
            await this.page.waitForTimeout(100);
        } catch (e) {
            // Ignored
        }
    }

    async takeScreenshot(symbol, suffix = "") {
        const filename = `${symbol.replace(':', '_')}_${suffix || Date.now()}.png`;
        await this.page.waitForSelector('.chart-container.single-visible', { timeout: 3000 });
        await this.closeZoomTooltip();
        const chartElement = await this.page.$('.chart-container.single-visible');
        await chartElement.screenshot({ path: filename, type: 'png' });
        return filename;
    }

    async stitchImages(files) {
        const stitchedPath = `stitched_${Date.now()}.png`;
        try {
            const [topMeta, bottomMeta] = await Promise.all([
                sharp(files[0]).metadata(),
                sharp(files[1]).metadata()
            ]);

            const width = Math.max(topMeta.width || 0, bottomMeta.width || 0);
            const height = (topMeta.height || 0) + (bottomMeta.height || 0);

            await sharp({
                create: {
                    width,
                    height,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            })
                .composite([
                    { input: files[0], left: Math.floor((width - (topMeta.width || 0)) / 2), top: 0 },
                    { input: files[1], left: Math.floor((width - (bottomMeta.width || 0)) / 2), top: topMeta.height || 0 }
                ])
                .png()
                .toFile(stitchedPath);

            return stitchedPath;
        } catch (error) {
            this.logger.error('ScreenshotService', `Failed to stitch images: ${error.message}`);
            throw error;
        }
    }

    async sendToTelegram(imagePath, symbol) {
        try {
            await this.telegramService.sendPhoto(imagePath, `📊 ${symbol} Chart - ${new Date().toLocaleString()}`);
        } catch (error) {
            this.logger.error('ScreenshotService', `Failed to send photo: ${error.message}`);
            throw error;
        }
    }

    async configureChartLayout() {
        try {
            await this.page.click('#header-toolbar-properties');
            await this.page.waitForSelector('button[data-name="legend"]', { timeout: 1000 });
            await this.page.click('button[data-name="legend"]');
            await this.page.waitForSelector('div[data-section-name="ohlcTitle"] input[type="checkbox"]', { timeout: 1000 });
            await this.page.locator('div[data-section-name="ohlcTitle"] input[type="checkbox"]').click({ force: true });
            await this.page.locator('div[data-section-name="barChange"] input[type="checkbox"]').click({ force: true });
            await this.page.click('button[data-name="trading"]');
            await this.page.waitForSelector('div[data-section-name="tradingSellBuyPanel"] input[type="checkbox"]', { timeout: 1000 });
            await this.page.locator('div[data-section-name="tradingSellBuyPanel"] input[type="checkbox"]').click({ force: true });
            await this.page.click('button[data-name="submit-button"]');
            await this.page.waitForTimeout(300);
        } catch (error) {
            this.logger.warn('ScreenshotService', `Chart layout configuration partially failed: ${error.message}`);
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.logger.info('ScreenshotService', "🧹 Browser closed");
        }
    }

    async processTickerQueue(tickers) {
        if (!tickers.length) return;
        try {
            await this.initBrowser();
            await this.navigateToChart();

            for (let i = 0; i < tickers.length; i++) {
                const symbol = tickers[i];
                this.logger.info('ScreenshotService', `📊 [${i + 1}/${tickers.length}] Processing ${symbol}`);

                await this.searchSymbol(symbol);
                if (!this.isInitialSetupComplete) {
                    await this.configureChartLayout();
                    this.isInitialSetupComplete = true;
                }

                await this.selectTimeInterval(this.config.screenshot.intervals.top);
                if (i === 0) await this.switchToExtendedHours();
                await this.zoomOutChart();
                const chartTop = await this.takeScreenshot(symbol, "top");

                await this.selectTimeInterval(this.config.screenshot.intervals.bottom);
                const chartBottom = await this.takeScreenshot(symbol, "bottom");

                const stitched = await this.stitchImages([chartTop, chartBottom]);
                await this.sendToTelegram(stitched, symbol);
                await this.cleanupFiles([chartTop, chartBottom, stitched]);
            }
        } catch (error) {
            this.logger.error('ScreenshotService', `Queue processing failed: ${error.message}`);
        } finally {
            await this.cleanup();
            this.isInitialSetupComplete = false;
        }
    }

    async cleanupFiles(files) {
        await Promise.all(files.map(file => fs.unlink(file).catch(() => { })));
    }
}

/**
 * Public API for screenshot processing
 */
export async function processTickerQueue(tickers, config, telegramService) {
    const service = new ScreenshotService(config, telegramService);
    await service.processTickerQueue(tickers);
}
