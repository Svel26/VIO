import { z } from 'zod';
import { Page } from 'playwright';
import { logger } from '../utils/logger.js';

export const ExtractPageDataSchema = z.object({
    description: z.string().describe('Natural language description of desired data.'),
    selectorHint: z.string().optional().describe('Optional CSS/XPath starting point.'),
});

export type ExtractPageDataParams = z.infer<typeof ExtractPageDataSchema>;

/**
 * Extracts data from the page. Initially uses direct outerHTML/innerText
 * so the Reasoning level can parse the semantic content.
 */
export async function extractPageData(params: ExtractPageDataParams, page: Page): Promise<any> {
    const { description, selectorHint } = params;
    logger.info(`Extracting page data: ${description}`);

    try {
        const data = await page.evaluate((hint) => {
            const root = (hint ? document.querySelector(hint) : document.body) as HTMLElement | null;
            if (!root) return { error: 'Selector hint not found' };

            return {
                title: document.title,
                url: window.location.href,
                content: (root.innerText || '').substring(0, 5000), // Limit for context window
                html: root.innerHTML.substring(0, 2000), // Snippet for structural understanding
            };
        }, selectorHint);

        logger.info('Page data extraction successful.');
        return data;
    } catch (error) {
        logger.error('Failed to extract page data:', error);
        throw error;
    }
}
