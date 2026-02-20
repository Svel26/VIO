import { execSync } from 'child_process';
import { DisplayInfo } from '../vision/capture.js';
import { logger } from './logger.js';

/**
 * Attempt to determine the device pixel ratio (DPR) the OS is currently
 * using.  A DPR > 1 is common on Retina / HiDPI displays or when the user
 * has configured >100% scaling on Windows.
 *
 * The value is used to translate screenshot pixel coordinates into the
 * operating system's native mouse coordinates.  If we cannot determine a
 * more accurate value we fall back to 1.
 *
 * @param display Optional display whose DPR we want to compute; on systems
 *                with multiple monitors the per-display scale can differ.
 */
export async function getDevicePixelRatio(display?: DisplayInfo): Promise<number> {
    try {
        if (process.platform === 'win32') {
            // Windows stores the DPI setting in the registry (default 96).
            // Higher values indicate scaling (>100%).
            const out = execSync('reg query "HKCU\\Control Panel\\Desktop\\WindowMetrics" /v AppliedDPI', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            const m = out.match(/AppliedDPI\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
            if (m) {
                const dpi = parseInt(m[1], 16);
                if (dpi > 0) {
                    return dpi / 96;
                }
            }
        } else if (process.platform === 'darwin') {
            // Use system_profiler to get the reported "resolution" and "UI" size
            // which can reveal Retina scaling (physical vs logical).
            const out = execSync('system_profiler SPDisplaysDataType', {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            const phys = out.match(/Resolution:\s*(\d+) x (\d+)/);
            const ui = out.match(/UI Looks like:\s*(\d+) x (\d+)/);
            if (phys && ui) {
                const wPhys = parseInt(phys[1], 10);
                const wUi = parseInt(ui[1], 10);
                if (wUi > 0) {
                    return wPhys / wUi;
                }
            }
        } else {
            // Linux / other: try xrandr if available
            try {
                const out = execSync('xrandr | grep "*"', { encoding: 'utf8' });
                // xrandr output includes a line like: "   1920x1080     60.00*+   "
                if (out) {
                    // cannot easily derive DPR here; leave as 1
                }
            } catch {
                // ignore errors, we'll just return 1
            }
        }
    } catch (err) {
        logger.debug('getDevicePixelRatio failed to detect scaling:', err);
    }
    return 1;
}
