import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { startCoreLoop } from './agent/core-loop.js';
import { logger } from './utils/logger.js';

const argv = yargs(hideBin(process.argv))
    .option('objective', {
        type: 'string',
        description: 'The high-level goal for VIO to accomplish',
    })
    .option('profile', {
        type: 'string',
        description: 'Path to a browser user-data directory for persistent sessions',
    })
    .help()
    .parseSync();

async function main() {
    logger.info('Initializing Autonomous Hybrid Computer-Controlling Agent');

    try {
        // --profile flag sets the env var the BrowserManager reads
        if (argv.profile) {
            process.env.VIO_USER_DATA_DIR = argv.profile;
        }

        const objective = argv.objective
            || (argv._ as string[])[0]
            || 'Describe the current environment context.';

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
