// Окремий сервіс для скріншотів NASDAQ:STEC
import { chromium } from "playwright";
import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import fs from "fs/promises";
import sharp from 'sharp';

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const CHAT_ID = process.env.CHAT_ID;
const SYMBOL = "NASDAQ:STEC";

class ScreenshotService {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initBrowser() {
        console.log("🚀 Initializing browser...");
        this.browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',
                '--disable-javascript-harmony-shipping',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-field-trial-config',
                '--disable-back-forward-cache',
                '--disable-ipc-flooding-protection',
                '--no-first-run',
                '--no-default-browser-check',
                '--memory-pressure-off'
            ]
        });
        this.page = await this.browser.newPage();
        
        // Set dark mode cookie for TradingView
        await this.page.context().addCookies([{
            name: 'theme',
            value: 'dark',
            domain: '.tradingview.com',
            path: '/',
            expires: Math.floor(Date.now() / 1000) + 86400 // 1 day
        }]);
        
        await this.page.setViewportSize({ width: 3500, height: 1300 });
        
        // Disable additional resources for speed
        await this.page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'font', 'media'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });
        console.log("✅ Browser initialized with dark theme");
    }

    async navigateToChart() {
        console.log("🌐 Navigating to TradingView...");
        await this.page.goto('https://www.tradingview.com/chart/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        await this.page.waitForSelector('#header-toolbar-symbol-search', { timeout: 8000 });
        console.log("✅ TradingView loaded");
        
    }

    async searchSymbol() {
        console.log(`🔍 Searching for ${SYMBOL}...`);

        // Клік по пошуку
        await this.page.click('#header-toolbar-symbol-search');
        await this.page.waitForSelector('input[data-role="search"]', { timeout: 2000 });

        // Очищаємо поле та вводимо символ
        await this.page.fill('input[data-role="search"]', '');
        await this.page.fill('input[data-role="search"]', SYMBOL);
        await this.page.press('input[data-role="search"]', 'Enter');
        
        // Чекаємо завантаження графіка
        await this.page.waitForSelector('.chart-container', { timeout: 5000 });

        console.log(`✅ ${SYMBOL} loaded`);
    }

    async selectTimeInterval(interval) {
        console.log(`⏱️ Setting time interval to ${interval}...`);
        try {
            // Клік по кнопці інтервалу
            await this.page.click('#header-toolbar-intervals button');
            
            // Простіше очікування та клік
            await this.page.waitForTimeout(200);
            await this.page.click(`div[data-value="${interval}"][data-role="menuitem"]`);
            await this.page.waitForTimeout(300);

            console.log(`✅ ${interval} interval selected`);
        } catch (e) {
            console.log("⚠️ Interval selection failed, continuing...");
        }
    }

    async switchToExtendedHours() {
        console.log("⏰ Switching to Extended Hours...");
        try {
            await this.page.click('button[data-name="session-menu"]');
            await this.page.waitForTimeout(200);
            await this.page.click('div[data-role="menuitem"]:has-text("Extended trading hours")');
            await this.page.waitForTimeout(300);
            console.log("✅ Extended Hours enabled");
        } catch (e) {
            console.log("⚠️ Extended Hours switch failed, continuing...");
        }
    }

    async zoomOutChart() {
        console.log("🔍 Zooming out chart...");
        try {
            // Фокусуємося на області графіка
            const chartElement = await this.page.$('.chart-container.single-visible');
            await chartElement.hover();
            
            // Робимо 3 швидкі прокрути колесиком для zoom out
            for (let i = 0; i < 3; i++) {
                await this.page.mouse.wheel(0, 500);
            }
            
            console.log("✅ Chart zoomed out");
        } catch (e) {
            console.log("⚠️ Zoom out failed, continuing...");
        }
    }

    async closeZoomTooltip() {
        try {
            // Чекаємо на появу тултпу та кнопки закриття
            await this.page.waitForSelector('.closeButton-zLVm6B4t', { timeout: 500 });
            // Клікаємо кнопку закриття
            await this.page.click('.closeButton-zLVm6B4t');
            console.log("✅ Zoom tooltip closed");
            // Коротка пауза для зникнення
            await this.page.waitForTimeout(100);
        } catch (e) {
            console.log("ℹ️ No zoom tooltip found or already closed");
        }
    }

    async takeScreenshot(suffix = "") {
        console.log("📸 Taking screenshot...");
        const timestamp = Date.now();
        const filename = `${SYMBOL.replace(':', '_')}_${suffix || timestamp}.png`;

        // Чекаємо на завантаження графіка
        await this.page.waitForSelector('.chart-container.single-visible', { timeout: 3000 });
        
        // Закриваємо спливаючу підказку про збільшення
        await this.closeZoomTooltip();
        
        // Отримуємо розміри та позицію контейнера графіка
        const chartElement = await this.page.$('.chart-container.single-visible');
        
        // Оптимізований скріншот елемента
        await chartElement.screenshot({ path: filename, type: 'png' });

        console.log(`✅ Screenshot saved: ${filename}`);
        return filename;
    }

    async stitchImages(files) {
        console.log("🖼️ Stitching images...");
        const stitchedImagePath = `stitched_${Date.now()}.png`;
        
        try {
            // Get metadata for both images
            const [topMeta, bottomMeta] = await Promise.all([
                sharp(files[0]).metadata(),
                sharp(files[1]).metadata()
            ]);
            
            // Calculate dimensions
            const width = Math.max(topMeta.width || 0, bottomMeta.width || 0);
            const height = (topMeta.height || 0) + (bottomMeta.height || 0);
            
            // Create final image with proper layout
            await sharp({
                create: {
                    width: width,
                    height: height,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            })
            .composite([
                // Top image (4H chart)
                {
                    input: files[0],
                    left: Math.floor((width - (topMeta.width || 0)) / 2), // Center horizontally
                    top: 0
                },
                // Bottom image (1M chart)
                {
                    input: files[1],
                    left: Math.floor((width - (bottomMeta.width || 0)) / 2), // Center horizontally
                    top: topMeta.height || 0
                }
            ])
            .png()
            .toFile(stitchedImagePath);

            console.log(`✅ Stitched image saved: ${stitchedImagePath}`);
            return stitchedImagePath;
        } catch (error) {
            console.error("❌ Failed to stitch images:", error.message);
            throw error;
        }
    }

    async sendToTelegram(imagePath) {
        console.log("📤 Sending to Telegram...");
        try {
            await bot.telegram.sendPhoto(CHAT_ID, { source: imagePath }, {
                caption: `📊 ${SYMBOL} Chart - ${new Date().toLocaleString()}`
            });
            console.log("✅ Photo sent to Telegram");
        } catch (error) {
            console.error("❌ Failed to send photo:", error.message);
            throw error;
        }
    }

    async configureChartLayout() {
        console.log("⚙️ Configuring chart layout...");
        
        try {
            // Open settings
            await this.page.click('#header-toolbar-properties');
            await this.page.waitForSelector('button[data-name="legend"]', { timeout: 1000 });

            // Click on Status line tab
            await this.page.click('button[data-name="legend"]');
            await this.page.waitForSelector('div[data-section-name="ohlcTitle"] input[type="checkbox"]', { timeout: 1000 });

            // Toggle checkboxes in Status line
            await this.page.locator('div[data-section-name="ohlcTitle"] input[type="checkbox"]').click({ force: true });
            await this.page.locator('div[data-section-name="barChange"] input[type="checkbox"]').click({ force: true });

            // Click on Trading tab
            await this.page.click('button[data-name="trading"]');
            await this.page.waitForSelector('div[data-section-name="tradingSellBuyPanel"] input[type="checkbox"]', { timeout: 1000 });

            // Toggle Buy/Sell buttons
            await this.page.locator('div[data-section-name="tradingSellBuyPanel"] input[type="checkbox"]').click({ force: true });

            // Apply changes
            await this.page.click('button[data-name="submit-button"]');
            
            // Коротка пауза для закриття діалогу
            await this.page.waitForTimeout(300);

            console.log("✅ Chart layout configured successfully");
        } catch (error) {
            console.error("❌ Failed to configure chart layout:", error.message);
            throw error;
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            console.log("🧹 Browser closed");
        }
    }

    async processScreenshot() {
        try {
            await this.initBrowser();
            await this.navigateToChart();
            await this.searchSymbol();
            await this.configureChartLayout();
            
            // Take 4H chart screenshot
            await this.selectTimeInterval("240");
            await this.switchToExtendedHours();
            await this.zoomOutChart();
            const chart4h = await this.takeScreenshot(`4h_${Date.now()}`);

            // Take 1M chart screenshot
            await this.selectTimeInterval("1");
            const chart1m = await this.takeScreenshot(`1m_${Date.now()}`);

            // Stitch images vertically (4H, 1M from top to bottom)
            const stitchedImagePath = await this.stitchImages([chart4h, chart1m]);
            
            // Send to Telegram first, then cleanup
            await this.sendToTelegram(stitchedImagePath);
            await this.cleanupFiles([chart4h, chart1m, stitchedImagePath]);

            console.log("🎉 Screenshot process completed successfully!");
        } catch (error) {
            console.error("❌ Error in screenshot process:", error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async cleanupFiles(files) {
        try {
            await Promise.all(files.map(file => fs.unlink(file).catch(() => {})));
            console.log("🗑️ Screenshot files deleted");
        } catch (e) {
            console.log("⚠️ Could not delete some screenshot files");
        }
    }
}

// Функція для запуску
export async function captureAndSendScreenshot() {
    const service = new ScreenshotService();
    await service.processScreenshot();
}

// Якщо файл запускається напряму

captureAndSendScreenshot()
    .then(() => {
        console.log("✅ Done!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("❌ Failed:", error.message);
        process.exit(1);
    });
