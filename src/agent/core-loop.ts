import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';
import { MAX_AGENT_STEPS, STEP_DELAY_MS, OBSERVATION_ELEMENT_DETAIL_LIMIT } from '../utils/config.js';
import { captureScreenshot, listDisplays, DisplayInfo } from '../vision/capture.js';
import { UIDetector, DetectedElement } from '../vision/detector.js';
import { BrowserManager } from '../vision/browser.js';
import { ReasoningAgent, ToolDefinition } from './reasoning.js';
import { StepHistory, StepRecord } from './step-history.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

// Tool imports
import { executeCli, ExecuteCliSchema } from '../tools/execute-cli.js';
import { clickUiEnhanced, ClickUiEnhancedSchema } from '../tools/click-ui-enhanced.js';
import { typeText, TypeTextSchema, keyCombo, KeyComboSchema } from '../tools/input-sim.js';
import { declareSuccess, DeclareSuccessSchema } from '../tools/declare-success.js';
import { navigateTo, NavigateToSchema } from '../tools/navigate-to.js';
import { executeJavaScript, ExecuteJavaScriptSchema } from '../tools/execute-javascript.js';
import { extractPageData, ExtractPageDataSchema } from '../tools/extract-page-data.js';
import { waitForHuman, WaitForHumanSchema } from '../tools/wait-for-human.js';

// ── Observation formatting ─────────────────────────────────────────

// Utility helpers to prune the accessibility tree before stringification.
// The goal is to remove invisible or semantically-empty nodes and ensure
// the resulting JSON stays valid even if truncated to a character budget.

/**
 * Recursively prune an accessibility snapshot node.
 *
 * - Filters nodes that are marked invisible or have zero size.
 * - Collapses single-child structural wrappers with no role/name.
 */
function pruneAxNode(node: any, depth: number = 0): any {
    if (!node || typeof node !== 'object') return node;

    // drop invisibles
    if (node.visible === false) return null;
    if (node.bounds && (node.bounds.width === 0 || node.bounds.height === 0)) {
        return null;
    }

    // recursively process children
    if (Array.isArray(node.children)) {
        const prunedChildren: any[] = [];
        for (const child of node.children) {
            const p = pruneAxNode(child, depth + 1);
            if (p !== null) prunedChildren.push(p);
        }
        node.children = prunedChildren;
    }

    // collapse meaningless wrappers: a generic role with no name and exactly one child
    if (
        node.role === 'generic' &&
        !node.name &&
        Array.isArray(node.children) &&
        node.children.length === 1
    ) {
        return node.children[0];
    }

    return node;
}

/**
 * Trim a pruned accessibility tree to fit within `maxChars` when stringified.
 * This function monotonically removes children from the end until the size
 * constraint is satisfied.  The algorithm prefers to drop siblings rather than
 * cut existing nodes in half, guaranteeing valid JSON.
 */
function trimAxTreeToSize(node: any, maxChars: number): any {
    let str = JSON.stringify(node);
    if (str.length <= maxChars) return node;

    if (node && Array.isArray(node.children)) {
        // greedily pop children until small enough
        while (node.children.length > 0 && JSON.stringify(node).length > maxChars) {
            node.children.pop();
        }
        // also recurse into remaining children if still too long
        for (const child of node.children) {
            if (JSON.stringify(node).length <= maxChars) break;
            trimAxTreeToSize(child, maxChars);
        }
    }
    return node;
}


/**
 * Build a structured, token-efficient observation string instead of
 * dumping raw JSON.  Highlights what matters and suppresses noise.
 */
function formatObservation(
    objective: string,
    step: number,
    displays: DisplayInfo[],
    displayId: string | undefined,
    axTree: unknown,
    elements: DetectedElement[],
    history: StepHistory,
): string {
    const parts: string[] = [];

    // ── Objective (always present) ──
    parts.push(`## Objective\n${objective}`);

    // ── Step counter ──
    parts.push(`## Step ${step} of ${MAX_AGENT_STEPS}`);

    // ── Action history ──
    parts.push(`## Action History\n${history.format()}`);

    // ── Stagnation warning (if any) ──
    const stagnation = history.detectStagnation();
    if (stagnation.isStagnating || stagnation.isThrashing) {
        parts.push(`## ⚠ WARNING\n${stagnation.message}`);
    }

    // ── Environment ──
    if (displays.length > 1) {
        const displayList = displays.map(d => `  • ${d.name} (${d.width}×${d.height} at ${d.left},${d.top})`).join('\n');
        parts.push(`## Connected Displays\n${displayList}\nCapturing from: ${displayId || 'primary'}`);
    }

    // ── Browser state ──

    if (axTree && typeof axTree === 'object') {
        // clone and prune so we don't mutate the original object
        const pruned = pruneAxNode(JSON.parse(JSON.stringify(axTree)));
        const role = (pruned as any).role || 'unknown';
        const name = (pruned as any).name || '';
        const childCount = Array.isArray((pruned as any).children) ? (pruned as any).children.length : 0;
        parts.push(`## Browser State\nPage: "${name}" (role: ${role}, ${childCount} top-level nodes)`);

        // Serialize the pruned tree. If it still exceeds our budget we
        // trim children iteratively rather than cutting the string, which
        // would produce invalid JSON and confuse the LLM.
        let treeStr = JSON.stringify(pruned);
        if (treeStr.length > 3000) {
            trimAxTreeToSize(pruned, 3000);
            treeStr = JSON.stringify(pruned);
            parts.push(`Accessibility Tree (trimmed): ${treeStr}`);
        } else {
            parts.push(`Accessibility Tree: ${treeStr}`);
        }
    } else {
        parts.push('## Browser State\nNo accessibility tree available (page may not be loaded).');
    }

    // ── Detected UI elements ──
    if (elements.length === 0) {
        parts.push('## Detected Screen Elements\nNo elements detected on screen.');
    } else if (elements.length <= OBSERVATION_ELEMENT_DETAIL_LIMIT) {
        // Small enough to list in full
        const elementLines = elements.map(el =>
            `  [${el.id}] ${el.type} at (${Math.round(el.center.x)}, ${Math.round(el.center.y)}) ` +
            `conf=${el.confidence.toFixed(2)}${el.text ? ` text="${el.text}"` : ''}`
        );
        parts.push(`## Detected Screen Elements (${elements.length})\n${elementLines.join('\n')}`);
    } else {
        // Too many — show summary + the highest-confidence ones
        const typeCounts = new Map<string, number>();
        for (const el of elements) {
            typeCounts.set(el.type, (typeCounts.get(el.type) ?? 0) + 1);
        }
        const summary = Array.from(typeCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([t, c]) => `${t} ×${c}`)
            .join(', ');

        const top = elements
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 10)
            .map(el =>
                `  [${el.id}] ${el.type} at (${Math.round(el.center.x)}, ${Math.round(el.center.y)}) ` +
                `conf=${el.confidence.toFixed(2)}${el.text ? ` text="${el.text}"` : ''}`
            );

        parts.push(
            `## Detected Screen Elements (${elements.length} total)\n` +
            `Summary: ${summary}\n` +
            `Top 10 by confidence:\n${top.join('\n')}`
        );
    }

    return parts.join('\n\n');
}

// ── Result summarizer ──────────────────────────────────────────────

/** Turn an arbitrary tool result into a short string suitable for history. */
function summarizeResult(result: unknown): string {
    if (result === undefined || result === null) return 'no return value';
    if (typeof result === 'boolean') return result ? 'true' : 'false';
    if (typeof result === 'string') return result.length > 100 ? result.slice(0, 97) + '...' : result;
    if (typeof result === 'object') {
        // ExecuteCliResult-like objects
        const obj = result as Record<string, unknown>;
        if ('success' in obj && 'exitCode' in obj) {
            const stdout = typeof obj.stdout === 'string' ? obj.stdout.slice(0, 80) : '';
            return `exit=${obj.exitCode} ${stdout}`;
        }
        const json = JSON.stringify(result);
        return json.length > 100 ? json.slice(0, 97) + '...' : json;
    }
    return String(result);
}

// ── Tool handler wrapper ───────────────────────────────────────────

/**
 * Wrap a tool handler so it automatically records its outcome
 * (success/failure/error, duration, result summary) in the StepHistory.
 */
function wrapHandler(
    name: string,
    handler: ToolDefinition['handler'],
    history: StepHistory,
    stepRef: { current: number },
): ToolDefinition['handler'] {
    return async (args) => {
        const start = Date.now();
        const record: StepRecord = {
            step: stepRef.current,
            tool: name,
            params: args,
            outcome: 'success',
            durationMs: 0,
            timestamp: Date.now(),
        };

        try {
            const result = await handler(args);
            record.durationMs = Date.now() - start;

            // Determine outcome from common return patterns
            if (result === false) {
                record.outcome = 'failure';
                record.result = 'returned false';
            } else if (typeof result === 'object' && result !== null && 'success' in result) {
                const obj = result as Record<string, unknown>;
                record.outcome = obj.success ? 'success' : 'failure';
                record.result = summarizeResult(result);
            } else {
                record.outcome = 'success';
                record.result = summarizeResult(result);
            }

            history.record(record);
            return result;
        } catch (error) {
            record.durationMs = Date.now() - start;
            record.outcome = 'error';
            record.error = error instanceof Error ? error.message : String(error);
            history.record(record);
            throw error;
        }
    };
}

// ── Core loop ──────────────────────────────────────────────────────

export async function startCoreLoop(objective: string): Promise<void> {
    const detector = new UIDetector();
    await detector.initialize();

    const browser = new BrowserManager();

    const reasoning = new ReasoningAgent();
    const history = new StepHistory();

    let isRunning = true;
    const stepRef = { current: 0 };

    // Build tool definitions with wrapped handlers that record outcomes
    const rawTools: ToolDefinition[] = [
        {
            name: 'execute_cli',
            description: 'Execute a terminal command. PREFERRED for all file operations, git, package management, text processing. Returns {success, stdout, stderr, exitCode}.',
            parameters: ExecuteCliSchema,
            handler: async (args) => await executeCli(args as Parameters<typeof executeCli>[0])
        },
        {
            name: 'click_ui_enhanced',
            description: 'Click a UI element identified by vision (for NATIVE apps only — use execute_javascript for browser elements). Returns true/false.',
            parameters: ClickUiEnhancedSchema,
            handler: async (args) => await clickUiEnhanced(args as Parameters<typeof clickUiEnhanced>[0], detector)
        },
        {
            name: 'type_text',
            description: 'Type text into the currently focused element. Make sure the target is focused first.',
            parameters: TypeTextSchema,
            handler: async (args) => await typeText(args as Parameters<typeof typeText>[0])
        },
        {
            name: 'key_combo',
            description: 'Perform a keyboard shortcut (e.g. ["Control", "A"] to select all).',
            parameters: KeyComboSchema,
            handler: async (args) => await keyCombo(args as Parameters<typeof keyCombo>[0])
        },
        {
            name: 'navigate_to',
            description: 'Navigate the browser to a URL. Returns true/false.',
            parameters: NavigateToSchema,
            handler: async (args) => await navigateTo(args as Parameters<typeof navigateTo>[0], await browser.getPage())
        },
        {
            name: 'execute_javascript',
            description: 'Execute JavaScript in the browser page context. Use this to click buttons, fill forms, read content — it targets DOM elements directly with zero coordinate error. PREFERRED over click_ui for anything in the browser.',
            parameters: ExecuteJavaScriptSchema,
            handler: async (args) => {
                if (!browser.isInitialized) {
                    return { success: false, error: "Browser is not open. You cannot use execute_javascript on native desktop apps. Use navigate_to first if you intend to browse the web." };
                }
                return await executeJavaScript(args as Parameters<typeof executeJavaScript>[0], await browser.getPage());
            }
        },
        {
            name: 'extract_page_data',
            description: 'Extract structured text/HTML content from the current browser page.',
            parameters: ExtractPageDataSchema,
            handler: async (args) => {
                if (!browser.isInitialized) {
                    return { success: false, error: "Browser is not open. You cannot use extract_page_data on native desktop apps." };
                }
                return await extractPageData(args as Parameters<typeof extractPageData>[0], await browser.getPage());
            }
        },
        {
            name: 'wait_for_human',
            description: 'PAUSE the agent and ask the human for help. Use when stuck (CAPTCHA, login, 3+ failures at a task).',
            parameters: WaitForHumanSchema,
            handler: async (args) => await waitForHuman(args as Parameters<typeof waitForHuman>[0])
        },
        {
            name: 'declare_success',
            description: 'Signal that the objective is verifiably complete. Only call after confirming the result on screen or via output.',
            parameters: DeclareSuccessSchema,
            handler: async (args) => {
                await declareSuccess(args as Parameters<typeof declareSuccess>[0]);
                isRunning = false;
            }
        }
    ];

    // Wrap each handler with the result interceptor
    const tools: ToolDefinition[] = rawTools.map(t => ({
        ...t,
        handler: wrapHandler(t.name, t.handler, history, stepRef),
    }));

    await reasoning.initialize(SYSTEM_PROMPT, tools);

    const tmpDir = path.join(os.tmpdir(), 'vio-agent');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    try {
        while (isRunning) {
            stepRef.current++;
            logger.info(`--- VIO Reasoning Step ${stepRef.current} ---`);

            // ── Tier 1: Observation ──
            const screenshot = await captureScreenshot();
            const displays = await listDisplays();
            const axTree = await browser.getAccessibilityTree();
            const elements = screenshot ? await detector.detect(screenshot.buffer, screenshot.width, screenshot.height) : [];

            // Save screenshot for SDK attachment
            let screenshotPath: string | undefined;
            if (screenshot) {
                screenshotPath = path.join(tmpDir, `screenshot-${stepRef.current}.png`);
                fs.writeFileSync(screenshotPath, screenshot.buffer);
            }

            // ── Tier 2 & 3: Reasoning & Action ──
            const prompt = formatObservation(
                objective,
                stepRef.current,
                displays,
                screenshot?.displayId,
                axTree,
                elements,
                history,
            );

            await reasoning.think(prompt, screenshotPath);

            await new Promise(r => setTimeout(r, STEP_DELAY_MS));

            if (stepRef.current >= MAX_AGENT_STEPS) {
                logger.warn(`Agent reached maximum step limit (${MAX_AGENT_STEPS}). Terminating.`);
                isRunning = false;
            }
        }
    } catch (error) {
        logger.error('Fatal error in core loop:', error);
    } finally {
        await reasoning.cleanup();
        await browser.cleanup();

        // Clean up temporary screenshots
        try {
            const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('screenshot-'));
            for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
            if (fs.readdirSync(tmpDir).length === 0) fs.rmdirSync(tmpDir);
            logger.info(`Cleaned up ${files.length} temporary screenshots.`);
        } catch {
            // best-effort cleanup
        }
    }
}
