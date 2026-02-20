import { startCoreLoop } from './agent/core-loop.js';
import { logger } from './utils/logger.js';

async function main() {
    logger.info('Initializing Autonomous Hybrid Computer-Controlling Agent');

    try {
        const objective = process.argv[2] || "Describe the current environment context.";
        logger.info(`Starting agent with objective: ${objective}`);

        await startCoreLoop(objective);

        logger.info('Agent core loop terminated successfully.');
    } catch (error) {
        logger.error('Agent process encountered a fatal error:', error);
        process.exit(1);
    }
}

// Handle unexpected termination
process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
    process.exit(1);
});

main();
