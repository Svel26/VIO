import { logger } from '../utils/logger.js';
import { HISTORY_RECENT_COUNT, STAGNATION_THRESHOLD } from '../utils/config.js';

// ── Types ──────────────────────────────────────────────────────────

export interface StepRecord {
    step: number;
    tool: string;
    params: Record<string, unknown>;
    outcome: 'success' | 'failure' | 'error';
    result?: string;          // short summary of the return value
    error?: string;           // error message if outcome is 'error'
    durationMs: number;
    timestamp: number;
}

export interface StagnationInfo {
    isStagnating: boolean;
    isThrashing: boolean;
    message: string;          // human-readable explanation injected into prompt
}

// ── StepHistory ────────────────────────────────────────────────────

/**
 * Tracks the agent's action history across reasoning steps.
 *
 * Provides:
 *  - Full detail for the N most recent actions
 *  - Compressed summary for older actions
 *  - Stagnation / thrashing detection
 */
export class StepHistory {
    private records: StepRecord[] = [];

    /** Record a completed tool invocation. */
    record(entry: StepRecord): void {
        this.records.push(entry);
        logger.info(
            `[History] Step ${entry.step}: ${entry.tool} → ${entry.outcome}` +
            (entry.durationMs ? ` (${entry.durationMs}ms)` : '')
        );
    }

    // ── Stagnation detection ───────────────────────────────────────

    /** Detect whether the agent is stuck in a loop or flip-flopping. */
    detectStagnation(): StagnationInfo {
        const recent = this.records.slice(-STAGNATION_THRESHOLD);
        if (recent.length < STAGNATION_THRESHOLD) {
            return { isStagnating: false, isThrashing: false, message: '' };
        }

        // Same tool + same params N times in a row
        const firstSig = this.signature(recent[0]);
        const allSame = recent.every(r => this.signature(r) === firstSig);
        if (allSame) {
            return {
                isStagnating: true,
                isThrashing: false,
                message:
                    `⚠ STAGNATION DETECTED: You have called "${recent[0].tool}" with the same parameters ` +
                    `${STAGNATION_THRESHOLD} times in a row and it keeps ${recent[0].outcome === 'success' ? 'succeeding without progress' : 'failing'}. ` +
                    `You MUST try a fundamentally different approach. Consider:\n` +
                    `  • Using a different tool entirely\n` +
                    `  • Changing your parameters\n` +
                    `  • Using wait_for_human if you are truly stuck`,
            };
        }

        // Thrashing: alternating between two failed actions (A-B-A-B pattern)
        if (recent.length >= 4) {
            const last4 = this.records.slice(-4);
            const sigA = this.signature(last4[0]);
            const sigB = this.signature(last4[1]);
            if (
                sigA !== sigB &&
                this.signature(last4[2]) === sigA &&
                this.signature(last4[3]) === sigB &&
                last4.every(r => r.outcome !== 'success')
            ) {
                return {
                    isStagnating: false,
                    isThrashing: true,
                    message:
                        `⚠ THRASHING DETECTED: You are alternating between "${last4[0].tool}" and "${last4[1].tool}" ` +
                        `and neither is succeeding. Stop and try a completely different strategy.`,
                };
            }
        }

        return { isStagnating: false, isThrashing: false, message: '' };
    }

    // ── Formatting for LLM context ────────────────────────────────

    /**
     * Format the action history as a compact string for inclusion in the
     * reasoning prompt.  Recent actions get full detail; older ones are
     * compressed into a narrative summary.
     */
    format(): string {
        if (this.records.length === 0) {
            return 'No actions taken yet — this is the first step.';
        }

        const parts: string[] = [];

        // Compressed summary of older actions
        const olderCount = Math.max(0, this.records.length - HISTORY_RECENT_COUNT);
        if (olderCount > 0) {
            const older = this.records.slice(0, olderCount);
            const toolCounts = new Map<string, { success: number; fail: number }>();
            for (const r of older) {
                const entry = toolCounts.get(r.tool) ?? { success: 0, fail: 0 };
                if (r.outcome === 'success') entry.success++;
                else entry.fail++;
                toolCounts.set(r.tool, entry);
            }
            const summary = Array.from(toolCounts.entries())
                .map(([tool, c]) => {
                    const total = c.success + c.fail;
                    return `${tool} ×${total}` + (c.fail > 0 ? ` (${c.fail} failed)` : '');
                })
                .join(', ');

            parts.push(`[Earlier: ${olderCount} actions — ${summary}]`);
        }

        // Full detail of recent actions
        const recent = this.records.slice(-HISTORY_RECENT_COUNT);
        for (const r of recent) {
            const paramSummary = this.summarizeParams(r.params);
            let line = `  Step ${r.step}: ${r.tool}(${paramSummary}) → ${r.outcome}`;
            if (r.result) line += ` | ${r.result}`;
            if (r.error) line += ` | ERROR: ${r.error}`;
            parts.push(line);
        }

        return `=== Action History (${this.records.length} total steps) ===\n` + parts.join('\n');
    }

    // ── Helpers ─────────────────────────────────────────────────────

    /** Produce a stable string signature for an action (tool + sorted params). */
    private signature(r: StepRecord): string {
        try {
            return `${r.tool}::${JSON.stringify(r.params, Object.keys(r.params).sort())}`;
        } catch {
            return `${r.tool}::?`;
        }
    }

    /** Summarize params to a short one-liner suitable for context. */
    private summarizeParams(params: Record<string, unknown>): string {
        const entries = Object.entries(params);
        if (entries.length === 0) return '';
        return entries
            .map(([k, v]) => {
                const val = typeof v === 'string'
                    ? (v.length > 40 ? `"${v.slice(0, 37)}..."` : `"${v}"`)
                    : JSON.stringify(v);
                return `${k}: ${val}`;
            })
            .join(', ');
    }

    /** Get the total number of recorded steps. */
    get length(): number {
        return this.records.length;
    }

    /** Get the last recorded step (if any). */
    get last(): StepRecord | undefined {
        return this.records[this.records.length - 1];
    }
}
