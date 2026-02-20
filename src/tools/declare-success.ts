import { z } from 'zod';
import { logger } from '../utils/logger.js';

export const DeclareSuccessSchema = z.object({
    summary: z.string().describe('Human-readable completion description.'),
    evidence: z.object({
        screenshot: z.string().optional().describe('Base64 final state image.'),
        outputFiles: z.array(z.string()).optional().describe('Paths to generated artifacts.'),
    }).optional().describe('Supporting evidence for success.'),
});

export type DeclareSuccessParams = z.infer<typeof DeclareSuccessSchema>;

export async function declareSuccess(params: DeclareSuccessParams): Promise<void> {
    logger.info('SUCCESS DECLARED');
    logger.info(`Summary: ${params.summary}`);
    if (params.evidence?.outputFiles) {
        logger.info(`Output files: ${params.evidence.outputFiles.join(', ')}`);
    }
}
