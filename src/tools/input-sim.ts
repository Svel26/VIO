import { mouse, keyboard, Key, Button, straightTo } from '@nut-tree-fork/nut-js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

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
 * Maps common string names (from LLM) to NutJS Key enum values.
 */
function mapToNutKey(keyString: string): Key {
    const s = keyString.trim().toLowerCase();

    // Specific modifier aliases
    if (s === 'control' || s === 'ctrl') return Key.LeftControl;
    if (s === 'shift') return Key.LeftShift;
    if (s === 'alt') return Key.LeftAlt;
    if (s === 'meta' || s === 'win' || s === 'windows' || s === 'super' || s === 'command' || s === 'cmd') return Key.LeftSuper;

    // Single character letters/numbers
    if (s.length === 1 && s.match(/[a-z0-9]/)) {
        // NutJS expects uppercase 'A', 'B', '1', '2'
        const upper = s.toUpperCase();
        if (upper in Key) return (Key as any)[upper] as Key;
    }

    // Try exact pascal case match (e.g. "Space" -> "Space", "Return" -> "Return")
    const pascal = s.charAt(0).toUpperCase() + s.slice(1);
    if (pascal in Key) return (Key as any)[pascal] as Key;

    // Try Enter vs Return alias
    if (pascal === 'Enter') return Key.Return;
    // Try Backspace vs Delete alias
    if (pascal === 'Backspace') return Key.Backspace;
    if (pascal === 'Del') return Key.Delete;
    if (pascal === 'Escape' || pascal === 'Esc') return Key.Escape;

    // Fallback: If the user provided an exact string that NutJS accepts
    if (keyString in Key) return (Key as any)[keyString] as Key;

    throw new Error(`Unsupported key string: "${keyString}"`);
}

/**
 * Executes a key combination.
 */
export async function keyCombo(params: z.infer<typeof KeyComboSchema>): Promise<void> {
    const { keys } = params;
    logger.info(`Executing key combo: ${keys.join(' + ')}`);

    const nutKeys = keys.map(mapToNutKey);
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
