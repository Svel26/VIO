import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';
import { captureScreenshot } from '../vision/capture.js';
import { UIDetector } from '../vision/detector.js';
import { ReasoningAgent } from './reasoning.js';

// Tool imports for registration
import { executeCli, ExecuteCliSchema } from '../tools/execute-cli.js';
import { clickUiEnhanced, ClickUiEnhancedSchema } from '../tools/click-ui-enhanced.js';
import { typeText, TypeTextSchema, keyCombo, KeyComboSchema } from '../tools/input-sim.js';
import { declareSuccess, DeclareSuccessSchema } from '../tools/declare-success.js';

export async function startCoreLoop(objective: string): Promise<void> {
    const detector = new UIDetector();
    await detector.initialize();

    const reasoning = new ReasoningAgent();

    let isRunning = true;

    // Tools are registered with handlers. 
    // The Copilot SDK will call these directly during its reasoning loop.
    const tools = [
        {
            name: 'execute_cli',
            description: 'Execute a terminal command',
            parameters: ExecuteCliSchema,
            handler: async (args: any) => await executeCli(args)
        },
        {
            name: 'click_ui_enhanced',
            description: 'Click a UI element semantically',
            parameters: ClickUiEnhancedSchema,
            handler: async (args: any) => await clickUiEnhanced(args, detector)
        },
        {
            name: 'type_text',
            description: 'Type text into the focused element',
            parameters: TypeTextSchema,
            handler: async (args: any) => await typeText(args)
        },
        {
            name: 'key_combo',
            description: 'Perform a keyboard shortcut',
            parameters: KeyComboSchema,
            handler: async (args: any) => await keyCombo(args)
        },
        {
            name: 'declare_success',
            description: 'Signal that the objective has been reached',
            parameters: DeclareSuccessSchema,
            handler: async (args: any) => {
                await declareSuccess(args);
                isRunning = false;
            }
        }
    ];

    await reasoning.initialize(
        "You are an autonomous computer-controlling agent. Use the vision data and tools provided to fulfill the objective.",
        tools
    );

    let step = 0;
    const tmpDir = path.join(os.tmpdir(), 'june-agent');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    try {
        while (isRunning) {
            step++;
            logger.info(`--- Agent Reasoning Step ${step} ---`);

            // Tier 1: Observation
            const screenshot = await captureScreenshot();
            const elements = screenshot ? await detector.detect(screenshot.base64) : [];

            // Save screenshot for SDK attachment
            let screenshotPath: string | undefined;
            if (screenshot) {
                screenshotPath = path.join(tmpDir, `screenshot-${step}.png`);
                fs.writeFileSync(screenshotPath, Buffer.from(screenshot.base64, 'base64'));
            }

            // Tier 2 & 3: Reasoning & Action
            // The SDK's sendAndWait will perform both thinking and tool execution.
            const prompt = `Objective: ${objective}\nDetected UI Elements: ${JSON.stringify(elements, null, 2)}`;
            await reasoning.think(prompt, screenshotPath);

            // Brief pause to stabilize system state
            await new Promise(r => setTimeout(r, 1000));

            // Safety limit
            if (step >= 10) {
                logger.warn('Agent reached maximum step limit (10). Terminating.');
                isRunning = false;
            }
        }
    } finally {
        await reasoning.cleanup();
    }
}
