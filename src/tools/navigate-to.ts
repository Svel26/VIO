import { z } from 'zod';
import { Page } from 'playwright';
import { logger } from '../utils/logger.js';

export const NavigateToSchema = z.object({
    url: z.string().url().describe('The URL to navigate to.'),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).default('networkidle').describe('The condition to wait for.'),
    timeoutMs: z.number().optional().default(30000).describe('Maximum navigation duration in milliseconds.'),
});

export type NavigateToParams = z.infer<typeof NavigateToSchema>;

export async function navigateTo(params: NavigateToParams, page: Page): Promise<boolean> {
    const { url, waitUntil, timeoutMs } = params;
    logger.info(`Navigating to ${url} (Wait until: ${waitUntil})...`);

    try {
        await page.goto(url, {
            waitUntil: waitUntil as any,
            timeout: timeoutMs,
        });
        logger.info(`Successfully navigated to ${url}`);
        return true;
    } catch (error) {
        logger.error(`Failed to navigate to ${url}:`, error);
        return false;
    }
}
