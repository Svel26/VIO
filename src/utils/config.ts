/**
 * Centralised configuration for the VIO agent.
 *
 * Values can be overridden via environment variables where noted.
 * A dedicated config module keeps magic numbers out of business logic
 * and makes tuning / debugging straightforward.
 */

function envInt(name: string, fallback: number): number {
    const v = process.env[name];
    if (v === undefined) return fallback;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? fallback : n;
}

function envFloat(name: string, fallback: number): number {
    const v = process.env[name];
    if (v === undefined) return fallback;
    const n = parseFloat(v);
    return Number.isNaN(n) ? fallback : n;
}

// ── Agent core loop ────────────────────────────────────────────────
/** Maximum reasoning steps before the agent automatically stops. */
export const MAX_AGENT_STEPS = envInt('VIO_MAX_STEPS', 15);

/** Milliseconds to pause between each reasoning step. */
export const STEP_DELAY_MS = envInt('VIO_STEP_DELAY_MS', 1000);

// ── Vision / Detector ──────────────────────────────────────────────
/** Minimum class-confidence to keep a detection candidate. */
export const DETECTION_CONF_THRESHOLD = envFloat('VIO_DETECTION_CONF', 0.45);

/** IoU threshold for Non-Maximum Suppression. */
export const NMS_IOU_THRESHOLD = envFloat('VIO_NMS_IOU', 0.45);

/** ONNX model input size (width and height). */
export const MODEL_INPUT_SIZE = 640;

// ── CLI execution ──────────────────────────────────────────────────
/** Max characters to keep from stdout/stderr before truncating. */
export const CLI_OUTPUT_MAX_LENGTH = envInt('VIO_CLI_MAX_OUTPUT', 10_000);

/** Default command timeout in ms (5 minutes). */
export const CLI_DEFAULT_TIMEOUT_MS = envInt('VIO_CLI_TIMEOUT_MS', 300_000);

/** Window (ms) for deduplicating repeated process launches. */
export const CLI_DEDUP_WINDOW_MS = envInt('VIO_CLI_DEDUP_MS', 30_000);

/**
 * Shell patterns that are blocked from execution.
 * Each entry is tested as a case-insensitive substring match against the
 * full command string.  Extend this list as needed.
 */
export const CLI_BLOCKED_PATTERNS: readonly string[] = [
    // Destructive filesystem operations
    'rm -rf /',
    'rmdir /s /q c:\\',
    'format c:',
    'del /f /s /q c:\\',
    // Credential / secret exfiltration
    'curl ', // block raw HTTP exfil – use navigate_to for web
    'wget ',
    'powershell -encodedcommand',
    'powershell -enc ',
    // Registry / system damage
    'reg delete',
    'bcdedit',
    'shutdown',
    // Privilege escalation
    'net user ',
    'net localgroup ',
] as const;

// ── Reasoning / Copilot SDK ────────────────────────────────────────
/** Model to use for the Copilot reasoning session. */
export const REASONING_MODEL = process.env.VIO_MODEL || 'gpt-4o';

/** Timeout (ms) when waiting for a Copilot SDK response. */
export const REASONING_TIMEOUT_MS = envInt('VIO_REASONING_TIMEOUT_MS', 120_000);

// ── Step History / Loop Detection ──────────────────────────────────
/** How many consecutive identical actions trigger a stagnation warning. */
export const STAGNATION_THRESHOLD = envInt('VIO_STAGNATION_THRESHOLD', 3);

/** Number of recent actions kept in full detail in the LLM context. */
export const HISTORY_RECENT_COUNT = envInt('VIO_HISTORY_RECENT', 5);

/** Max elements to list in full detail in the observation (beyond this, only summary). */
export const OBSERVATION_ELEMENT_DETAIL_LIMIT = envInt('VIO_ELEMENT_DETAIL_LIMIT', 20);

