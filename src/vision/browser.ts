import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../utils/logger.js';

// Apply stealth plugin
(chromium as any).use(StealthPlugin());

export class BrowserManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    async initialize() {
        try {
            logger.info('Initializing Stealth Browser (playwright-extra)...');
            this.browser = await (chromium as any).launch({
                headless: false,
            });

            // Set up a structured context with a common user agent
            this.context = await this.browser!.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                viewport: { width: 1280, height: 720 },
                deviceScaleFactor: 1,
            });

            this.page = await this.context.newPage();
            logger.info('Stealth Browser initialized successfully.');
        } catch (error) {
            logger.error('Failed to initialize browser:', error);
            throw error;
        }
    }

    async getPage(): Promise<Page> {
        if (!this.page) {
            await this.initialize();
        }
        return this.page!;
    }

    async getAccessibilityTree() {
        if (!this.page) return null;
        try {
            // Some environments/versions might have different property locations
            const accessibility = (this.page as any).accessibility;
            if (!accessibility || typeof accessibility.snapshot !== 'function') {
                logger.warn('Accessibility API not available on current page.');
                return null;
            }
            return await accessibility.snapshot();
        } catch (error) {
            logger.error('Failed to capture accessibility tree:', error);
            return null;
        }
    }

    async captureScreenshot(): Promise<string | null> {
        if (!this.page) return null;
        try {
            const buffer = await this.page.screenshot();
            return buffer.toString('base64');
        } catch (error) {
            logger.error('Failed to capture browser screenshot:', error);
            return null;
        }
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.context = null;
            this.page = null;
            logger.info('Browser cleaned up.');
        }
    }
}
