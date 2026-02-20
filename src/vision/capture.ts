import screenshot from 'screenshot-desktop';
import { logger } from '../utils/logger.js';

export interface ScreenshotResult {
    base64: string;
    width: number;
    height: number;
}

/**
 * Captures a screenshot of the primary display and return as a Base64 string.
 * Optimized for LLM vision and YOLO consumption.
 */
export async function captureScreenshot(): Promise<ScreenshotResult | null> {
    try {
        logger.info('Capturing system screenshot...');

        // capture returns a Buffer by default (PNG)
        const buffer = await screenshot();

        // For scaffolding, we'll return a fixed resolution or the real one.
        // In a real implementation, we might use sharper/canvas to get dims.
        // We'll return the base64 for now.

        return {
            base64: buffer.toString('base64'),
            width: 1920, // Placeholder dims - in prod use image lib to get real ones
            height: 1080
        };
    } catch (error) {
        logger.error('Failed to capture screenshot:', error);
        return null;
    }
}
