import { mouse, keyboard, Key, Button, straightTo } from '@nut-tree-fork/nut-js';
import { z } from 'zod';
import { logger } from '../utils/logger';

export const TypeTextSchema = z.object({
    text: z.string().describe('The text to type.'),
    delayMs: z.number().optional().default(10).describe('Delay between keystrokes.'),
});

export const KeyComboSchema = z.object({
    keys: z.array(z.string()).describe('List of keys for combo, e.g. ["Control", "A"]'),
});

/**
 * Types text into the focused element.
 */
export async function typeText(params: z.infer<typeof TypeTextSchema>): Promise<void> {
    const { text, delayMs } = params;
    logger.info(`Typing text: "${text.slice(0, 20)}..."`);

    keyboard.config.autoDelayMs = delayMs;
    await keyboard.type(text);
}

/**
 * Executes a key combination.
 */
export async function keyCombo(params: z.infer<typeof KeyComboSchema>): Promise<void> {
    const { keys } = params;
    logger.info(`Executing key combo: ${keys.join(' + ')}`);

    const nutKeys = keys.map(k => (Key as any)[k] || k);
    await keyboard.pressKey(...nutKeys);
    await keyboard.releaseKey(...nutKeys);
}

/**
 * Helper to move and click at specific coordinates.
 */
export async function clickAt(x: number, y: number): Promise<void> {
    logger.info(`Clicking at (${x}, ${y})`);
    await mouse.move(straightTo({ x, y }));
    await mouse.click(Button.LEFT);
}
