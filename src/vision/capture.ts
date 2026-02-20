import screenshot from 'screenshot-desktop';
import { logger } from '../utils/logger.js';

export interface DisplayInfo {
    id: string | number;
    name: string;
    width: number;
    height: number;
    left: number;
    top: number;
}

export interface ScreenshotResult {
    buffer: Buffer;
    base64: string;
    width: number;
    height: number;
    displayId?: string;
}

/**
 * Enumerates all connected displays.
 */
/**
 * The @types/screenshot-desktop Display type only has { id, name }.
 * On Windows (and most platforms) the runtime objects also carry
 * width, height, left, top.  We declare that here.
 */
interface RuntimeDisplay {
    id: string | number;
    name: string;
    width: number;
    height: number;
    left: number;
    top: number;
}

export async function listDisplays(): Promise<DisplayInfo[]> {
    try {
        const displays = await screenshot.listDisplays() as unknown as RuntimeDisplay[];
        return displays.map((d) => ({
            id: d.id,
            name: d.name,
            width: d.width,
            height: d.height,
            left: d.left,
            top: d.top,
        }));
    } catch (error) {
        logger.error('Failed to enumerate displays:', error);
        return [];
    }
}

/**
 * Captures a screenshot of a specific display (or the primary one if none specified).
 */
export async function captureScreenshot(displayId?: string): Promise<ScreenshotResult | null> {
    try {
        const displays = await listDisplays();
        const targetDisplay = displayId
            ? displays.find(d => d.id === displayId || d.name === displayId)
            : displays.find(d => d.left === 0 && d.top === 0) || displays[0];

        if (!targetDisplay) {
            logger.error(`Target display ${displayId} not found.`);
            return null;
        }

        logger.info(`Capturing screenshot of display: ${targetDisplay.name} (${targetDisplay.width}x${targetDisplay.height})`);

        const buffer = await screenshot({ screen: targetDisplay.id });

        return {
            buffer,
            base64: buffer.toString('base64'),
            width: targetDisplay.width,
            height: targetDisplay.height,
            displayId: targetDisplay.id.toString()
        };
    } catch (error) {
        logger.error('Failed to capture screenshot:', error);
        return null;
    }
}
