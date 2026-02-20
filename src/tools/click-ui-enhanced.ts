import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { UIDetector, DetectedElement } from '../vision/detector.js';
import { captureScreenshot, listDisplays, DisplayInfo } from '../vision/capture.js';
import { getDevicePixelRatio } from '../utils/display.js';
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

    // 1. Capture current state (primary or targeted display)
    const observation = await captureScreenshot();
    if (!observation) return false;

    // 2. Detect elements (pass raw buffer plus original size)
    const elements = await detector.detect(observation.buffer, observation.width, observation.height);

    // 3. Resolve target element
    const target = resolveTarget(params, elements);

    if (!target) {
        logger.warn('Target element not found in current view.');
        return false;
    }

    // 4. Resolve multi-display offsets and DPI scaling
    const displays = await listDisplays();
    const currentDisplay: DisplayInfo | undefined = observation.displayId
        ? displays.find(d => d.id.toString() === observation.displayId)
        : displays.find(d => d.left === 0 && d.top === 0);

    const displayLeft = currentDisplay?.left || 0;
    const displayTop = currentDisplay?.top || 0;

    // Determine device pixel ratio for the current display; this will
    // convert screenshot pixel coordinates into the OS's native mouse
    // coordinate system.  Defaults to 1 if detection fails.
    const dpr = await getDevicePixelRatio(currentDisplay);

    // 5. Execute click with global coordinates, applying scaling factor
    const finalX = (target.center.x + offsetX + displayLeft) * dpr;
    const finalY = (target.center.y + offsetY + displayTop) * dpr;

    logger.info(`Final global coordinates: (${finalX}, ${finalY}) on display ${currentDisplay?.name || 'unknown'}`);

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
