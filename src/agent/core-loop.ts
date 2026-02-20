import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';
import { captureScreenshot } from '../vision/capture.js';
import { UIDetector } from '../vision/detector.js';
import { BrowserManager } from '../vision/browser.js';
import { ReasoningAgent } from './reasoning.js';

// Tool imports
import { executeCli, ExecuteCliSchema } from '../tools/execute-cli.js';
import { clickUiEnhanced, ClickUiEnhancedSchema } from '../tools/click-ui-enhanced.js';
import { typeText, TypeTextSchema, keyCombo, KeyComboSchema } from '../tools/input-sim.js';
import { declareSuccess, DeclareSuccessSchema } from '../tools/declare-success.js';
import { navigateTo, NavigateToSchema } from '../tools/navigate-to.js';
import { executeJavaScript, ExecuteJavaScriptSchema } from '../tools/execute-javascript.js';
import { extractPageData, ExtractPageDataSchema } from '../tools/extract-page-data.js';
import { waitForHuman, WaitForHumanSchema } from '../tools/wait-for-human.js';

export async function startCoreLoop(objective: string): Promise<void> {
    const detector = new UIDetector();
    await detector.initialize();

    const browser = new BrowserManager();
    // We initialize the browser only if needed, or eagerly if preferred.
    // Eagerly launching for Phase 3 as browser focus is primary.
    await browser.initialize();

    const reasoning = new ReasoningAgent();

    let isRunning = true;

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
            name: 'navigate_to',
            description: 'Navigate to a URL in the browser',
            parameters: NavigateToSchema,
            handler: async (args: any) => await navigateTo(args, await browser.getPage())
        },
        {
            name: 'execute_javascript',
            description: 'Execute JS on the current web page',
            parameters: ExecuteJavaScriptSchema,
            handler: async (args: any) => await executeJavaScript(args, await browser.getPage())
        },
        {
            name: 'extract_page_data',
            description: 'Extract data/content from the current web page',
            parameters: ExtractPageDataSchema,
            handler: async (args: any) => await extractPageData(args, await browser.getPage())
        },
        {
            name: 'wait_for_human',
            description: 'Pause the agent and wait for a human to perform an action (like solving a CAPTCHA or confirming a sensitive step).',
            parameters: WaitForHumanSchema,
            handler: async (args: any) => await waitForHuman(args)
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
        "You are an autonomous computer-controlling assistant. You have a vision system and a stealth browser. " +
        "Prioritize using terminal for OS tasks and Playwright (navigate_to, etc.) for web tasks. " +
        "If you encounter a CAPTCHA, verification screen, or are blocked by bot detection, DO NOT loop. " +
        "Instead, use the 'wait_for_human' tool to ask the user to clear the blockage for you.",
        tools
    );

    let step = 0;
    const tmpDir = path.join(os.tmpdir(), 'june-agent');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    try {
        while (isRunning) {
            step++;
            logger.info(`--- Phase 4 Reasoning Step ${step} ---`);

            // Tier 1: Observation
            // We prioritize the browser screenshot if it's the active context,
            // but the general screen capture is safer for full-system control.
            const screenshot = await captureScreenshot();
            const axTree = await browser.getAccessibilityTree();
            const elements = screenshot ? await detector.detect(screenshot.base64) : [];

            // Save screenshot for SDK attachment
            let screenshotPath: string | undefined;
            if (screenshot) {
                screenshotPath = path.join(tmpDir, `screenshot-${step}.png`);
                fs.writeFileSync(screenshotPath, Buffer.from(screenshot.base64, 'base64'));
            }

            // Tier 2 & 3: Reasoning & Action
            const prompt = `Objective: ${objective}\n` +
                `Browser Accessibility Tree: ${JSON.stringify(axTree)}\n` +
                `Detected Screen Elements: ${JSON.stringify(elements, null, 2)}`;

            await reasoning.think(prompt, screenshotPath);

            await new Promise(r => setTimeout(r, 1000));

            if (step >= 15) { // Increased for Phase 3
                logger.warn('Agent reached maximum step limit (15). Terminating.');
                isRunning = false;
            }
        }
    } catch (error) {
        logger.error('Fatal error in core loop:', error);
    } finally {
        await reasoning.cleanup();
        await browser.cleanup();
    }
}
