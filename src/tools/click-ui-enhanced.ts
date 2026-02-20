import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { UIDetector, DetectedElement } from '../vision/detector.js';
import { captureScreenshot } from '../vision/capture.js';
import { clickAt } from './input-sim.js';

export const ClickUiEnhancedSchema = z.object({
    elementText: z.string().optional().describe('Text to search for on the element.'),
    elementType: z.string().optional().describe('Type of element to click (button, link, etc.).'),
    offsetX: z.number().optional().default(0),
    offsetY: z.number().optional().default(0),
});

export type ClickUiEnhancedParams = z.infer<typeof ClickUiEnhancedSchema>;

/**
 * Enhanced click tool that resolves a semantic target to a physical coordinate using vision.
 */
export async function clickUiEnhanced(params: ClickUiEnhancedParams, detector: UIDetector): Promise<boolean> {
    const { elementText, elementType, offsetX, offsetY } = params;
    logger.info(`Enhanced click requested for: ${elementText || 'any'} ${elementType || 'element'}`);

    // 1. Capture current state
    const observation = await captureScreenshot();
    if (!observation) return false;

    // 2. Detect elements
    const elements = await detector.detect(observation.base64);

    // 3. Resolve target element
    const target = resolveTarget(params, elements);

    if (!target) {
        logger.warn('Target element not found in current view.');
        return false;
    }

    // 4. Execute click
    const finalX = target.center.x + offsetX;
    const finalY = target.center.y + offsetY;

    await clickAt(finalX, finalY);
    return true;
}

function resolveTarget(params: ClickUiEnhancedParams, elements: DetectedElement[]): DetectedElement | null {
    const { elementText, elementType } = params;

    // Simple heuristic matching
    return elements.find(el => {
        const textMatch = !elementText || (el.text && el.text.toLowerCase().includes(elementText.toLowerCase()));
        const typeMatch = !elementType || el.type.toLowerCase() === elementType.toLowerCase();
        return textMatch && typeMatch;
    }) || null;
}
