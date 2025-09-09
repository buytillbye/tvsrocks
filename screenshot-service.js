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
            args: ['--no-sandbox', '--disable-setuid-sandbox']
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
        console.log("✅ Browser initialized with dark theme");
    }

    async navigateToChart() {
        console.log("🌐 Navigating to TradingView...");
        await this.page.goto('https://www.tradingview.com/chart/', {
            waitUntil: 'networkidle',
            timeout: 30000
        });
        await this.page.waitForSelector('#header-toolbar-symbol-search', { timeout: 15000 });
        console.log("✅ TradingView loaded");
        
    }

    async searchSymbol() {
        console.log(`🔍 Searching for ${SYMBOL}...`);

        // Клік по пошуку
        await this.page.click('#header-toolbar-symbol-search');
        await this.page.waitForSelector('input[data-role="search"]', { timeout: 5000 });

        // Вводимо символ
        await this.page.fill('input[data-role="search"]', SYMBOL);
        await this.page.press('input[data-role="search"]', 'Enter');
        await this.page.waitForTimeout(3000);

        console.log(`✅ ${SYMBOL} loaded`);
    }

    async selectTimeInterval(interval) {
        console.log(`⏱️ Setting time interval to ${interval}...`);
        if(interval != '240') {
            await this.page.setViewportSize({ width: 1750, height: 650 });
        }
        try {
            // Клік по кнопці інтервалу (D)
            await this.page.click('#header-toolbar-intervals button');
            await this.page.waitForTimeout(1000);

            // Вибираємо інтервал з меню
            await this.page.click(`div[data-value="${interval}"][data-role="menuitem"]`);
            await this.page.waitForTimeout(2000);

            console.log(`✅ ${interval} interval selected`);
        } catch (e) {
            console.log("⚠️ Interval selection failed, continuing...");
        }
    }

    async switchToExtendedHours() {
        console.log("⏰ Switching to Extended Hours...");
        try {
            await this.page.click('button[data-name="session-menu"]');
            await this.page.waitForTimeout(1000);
            await this.page.click('div[data-role="menuitem"]:has-text("Extended trading hours")');
            await this.page.waitForTimeout(2000);
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
            
            // Робимо 2 повних прокрути колесиком для zoom out
            for (let i = 0; i < 5; i++) {
                await this.page.mouse.wheel(0, 500); // Негативне значення для zoom out
                await this.page.waitForTimeout(100); // Пауза між прокрутками
            }
            
            console.log("✅ Chart zoomed out");
        } catch (e) {
            console.log("⚠️ Zoom out failed, continuing...");
        }
    }

    async closeZoomTooltip() {
        try {
            // Чекаємо на появу тултпу та кнопки закриття
            await this.page.waitForSelector('.closeButton-zLVm6B4t', { timeout: 3000 });
            // Клікаємо кнопку закриття
            await this.page.click('.closeButton-zLVm6B4t');
            console.log("✅ Zoom tooltip closed");
            // Чекаємо трохи, щоб анімація закриття завершилася
            await this.page.waitForTimeout(500);
        } catch (e) {
            console.log("ℹ️ No zoom tooltip found or already closed");
        }
    }

    async takeScreenshot(suffix = "") {
        console.log("📸 Taking screenshot...");
        const timestamp = Date.now();
        const filename = `${SYMBOL.replace(':', '_')}_${suffix || timestamp}.png`;

        // Чекаємо на завантаження графіка
        await this.page.waitForSelector('.chart-container.single-visible', { timeout: 10000 });
        
        // Закриваємо спливаючу підказку про збільшення
        await this.closeZoomTooltip();
        
        // Отримуємо розміри та позицію контейнера графіка
        const chartElement = await this.page.$('.chart-container.single-visible');
        const boundingBox = await chartElement.boundingBox();
        
        await this.page.screenshot({
            path: filename,
            fullPage: false,
            clip: {
                x: boundingBox.x,
                y: boundingBox.y,
                width: boundingBox.width,
                height: boundingBox.height
            }
        });

        console.log(`✅ Screenshot saved: ${filename} (${boundingBox.width}x${boundingBox.height})`);
        return filename;
    }

    async stitchImages(files) {
        console.log("� Stitching images...");
        const stitchedImagePath = `stitched_${Date.now()}.png`;
        
        try {
            // Отримуємо метадані всіх зображень
            const meta = await Promise.all(files.map(f => sharp(f).metadata()));
            const maxWidth = Math.max(...meta.map(m => m.width || 0));
            const totalHeight = meta.reduce((s, m) => s + (m.height || 0), 0);

            // Створюємо композит з правильними позиціями
            let y = 0;
            const composite = files.map((f, i) => {
                const item = { input: f, left: 0, top: y };
                y += meta[i].height || 0;
                return item;
            });

            // Створюємо фінальне зображення
            await sharp({
                create: {
                    width: maxWidth,
                    height: totalHeight,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            })
            .composite(composite)
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
            await this.selectTimeInterval("240"); // 4 hours
            await this.switchToExtendedHours();
            await this.zoomOutChart();

            // Робимо 3 скріншоти для різних інтервалів
            const images = [];
            for (const interval of ["240", "15", "1"]) {
                await this.selectTimeInterval(interval);
                await this.page.waitForTimeout(2000); // Чекаємо оновлення графіка
                const imagePath = await this.takeScreenshot(`${interval}_${Date.now()}`);
                images.push(imagePath);
            }

            // Склеюємо зображення
            const stitchedImagePath = await this.stitchImages(images);
            await this.sendToTelegram(stitchedImagePath);

            // Видаляємо файли після відправки
            try {
                await Promise.all(images.map(fs.unlink));
                await fs.unlink(stitchedImagePath);
                console.log("🗑️ Screenshot files deleted");
            } catch (e) {
                console.log("⚠️ Could not delete screenshot files");
            }

            console.log("🎉 Screenshot process completed successfully!");

        } catch (error) {
            console.error("❌ Error in screenshot process:", error.message);
            throw error;
        } finally {
            await this.cleanup();
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
