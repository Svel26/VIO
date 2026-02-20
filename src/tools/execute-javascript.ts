import { z } from 'zod';
import { Page } from 'playwright';
import { logger } from '../utils/logger.js';

export const ExecuteJavaScriptSchema = z.object({
    script: z.string().describe('The JavaScript code to execute in the page context.'),
    args: z.array(z.any()).optional().describe('Serializable arguments passed to the script.'),
    timeoutMs: z.number().optional().default(30000).describe('Maximum execution duration in milliseconds.'),
});

export type ExecuteJavaScriptParams = z.infer<typeof ExecuteJavaScriptSchema>;

export async function executeJavaScript(params: ExecuteJavaScriptParams, page: Page): Promise<any> {
    const { script, args, timeoutMs } = params;
    logger.info(`Executing JavaScript on page...`);

    try {
        const result = await Promise.race([
            page.evaluate(script, args),
            new Promise((_, reject) => setTimeout(() => reject(new Error('JS execution timeout')), timeoutMs))
        ]);
        logger.info('JavaScript execution completed successfully.');
        return result;
    } catch (error) {
        logger.error('JavaScript execution failed:', error);
        throw error;
    }
}
