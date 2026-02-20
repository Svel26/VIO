import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../utils/logger.js';

export class BrowserManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    async initialize() {
        try {
            logger.info('Initializing Playwright Browser (Headful)...');
            this.browser = await chromium.launch({
                headless: false, // Per plan.md: headful for maximum compatibility
            });
            this.context = await this.browser.newContext();
            this.page = await this.context.newPage();
            logger.info('Browser initialized successfully.');
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
