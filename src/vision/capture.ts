import screenshot from 'screenshot-desktop';
import { logger } from '../utils/logger.js';

export interface DisplayInfo {
    id: any;
    name: string;
    width: number;
    height: number;
    left: number;
    top: number;
}

export interface ScreenshotResult {
    base64: string;
    width: number;
    height: number;
    displayId?: string;
}

/**
 * Enumerates all connected displays.
 */
export async function listDisplays(): Promise<DisplayInfo[]> {
    try {
        const displays = await screenshot.listDisplays();
        return displays.map((d: any) => ({
            id: d.id,
            name: d.name,
            width: d.width,
            height: d.height,
            left: d.left,
            top: d.top
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
