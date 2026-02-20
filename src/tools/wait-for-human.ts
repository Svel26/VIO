import { z } from 'zod';
import { logger } from '../utils/logger.js';
import readline from 'readline';

export const WaitForHumanSchema = z.object({
    reason: z.string().describe('The reason the agent is waiting, e.g. "CAPTCHA detected" or "Payment confirmation needed".'),
});

export type WaitForHumanParams = z.infer<typeof WaitForHumanSchema>;

/**
 * Tool that pauses the agent and waits for the user to press Enter in the terminal.
 * This is used for human-in-the-loop fallback (e.g. solving CAPTCHAs).
 */
export async function waitForHuman(params: WaitForHumanParams): Promise<string> {
    const { reason } = params;
    logger.warn(`--- AGENT PAUSED: HUMAN INTERVENTION REQUIRED ---`);
    logger.warn(`Reason: ${reason}`);
    logger.info(`Please perform the necessary action in the browser window, then press [ENTER] in this terminal to continue the agent.`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('', () => {
            rl.close();
            logger.info('Human signal received. Resuming agent core loop...');
            resolve('Human confirmed the action/bypass.');
        });
    });
}
