import { spawn, execSync } from 'child_process';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import {
    CLI_BLOCKED_PATTERNS,
    CLI_DEDUP_WINDOW_MS,
    CLI_DEFAULT_TIMEOUT_MS,
    CLI_OUTPUT_MAX_LENGTH,
} from '../utils/config.js';

// Simple dedup / safety for process-launching commands to avoid repeated GUI spawns
const recentCommands = new Map<string, number>();
const DEDUP_WINDOW_MS = CLI_DEDUP_WINDOW_MS;

function extractProcessName(command: string): string | null {
    // find the first occurrence of something like name.exe
    const m = command.match(/([A-Za-z0-9_\-\.]+\.exe)/i);
    if (m) return m[1];
    return null;
}

function processIsRunning(procName: string): boolean {
    try {
        if (process.platform === 'win32') {
            const out = execSync(`tasklist /fi "imagename eq ${procName}" /nh`, { encoding: 'utf8' });
            return out.toLowerCase().includes(procName.toLowerCase());
        } else {
            // fallback for *nix: pgrep
            try {
                execSync(`pgrep -f ${procName}`);
                return true;
            } catch (e) {
                return false;
            }
        }
    } catch (e) {
        return false;
    }
}

export const ExecuteCliSchema = z.object({
    command: z.string().describe('The shell command to execute.'),
    cwd: z.string().optional().describe('Optional working directory.'),
    timeoutMs: z.number().optional().describe(`Maximum execution time in milliseconds (default ${CLI_DEFAULT_TIMEOUT_MS}).`),
});

export type ExecuteCliParams = z.infer<typeof ExecuteCliSchema>;

export interface ExecuteCliResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
}

export async function executeCli(params: ExecuteCliParams): Promise<ExecuteCliResult> {
    const { command, cwd = process.cwd(), timeoutMs = CLI_DEFAULT_TIMEOUT_MS } = params;

    logger.info(`Executing CLI command: "${command}" in ${cwd}`);

    // Safety: reject commands that match known-dangerous patterns
    const lowerCmd = command.toLowerCase();
    const blocked = CLI_BLOCKED_PATTERNS.find(p => lowerCmd.includes(p.toLowerCase()));
    if (blocked) {
        logger.error(`BLOCKED: command matched safety rule "${blocked}"`);
        return {
            success: false,
            stdout: '',
            stderr: `[BLOCKED] Command rejected by safety filter (matched: "${blocked}")`,
            exitCode: -1,
            durationMs: 0,
        };
    }
    const startTime = Date.now();

    // If the command appears to launch a GUI app that is already running, skip relaunch
    const procName = extractProcessName(command);
    if (procName && processIsRunning(procName)) {
        const last = recentCommands.get(command) ?? 0;
        const ago = Date.now() - last;
        if (ago < DEDUP_WINDOW_MS) {
            logger.info(`Skipping duplicate launch for '${procName}' (requested ${Math.round(ago / 1000)}s ago).`);
            return {
                success: true,
                stdout: `[SKIP] Process ${procName} already running (deduped)`,
                stderr: '',
                exitCode: 0,
                durationMs: Date.now() - startTime,
            };
        }

        logger.info(`Process '${procName}' already running — not launching again.`);
        recentCommands.set(command, Date.now());
        return {
            success: true,
            stdout: `[SKIP] Process ${procName} already running`,
            stderr: '',
            exitCode: 0,
            durationMs: Date.now() - startTime,
        };
    }

    return new Promise((resolve) => {
        // Determine shell block depending on platform for complex commands
        // spawn with detached=true so we can kill the entire group later.
        const child = spawn(command, [], {
            cwd,
            shell: true,
            env: process.env,
            detached: true,
        });
        // allow parent to exit independently of child
        child.unref();

        const killProcessTree = () => {
            try {
                if (child.pid) {
                    if (process.platform === 'win32') {
                        execSync(`taskkill /pid ${child.pid} /t /f`);
                    } else {
                        // negative pid targets the process group
                        process.kill(-child.pid, 'SIGKILL');
                    }
                }
            } catch {
                // best-effort
            }
        };

        let stdoutData = '';
        let stderrData = '';

        const timeoutId = setTimeout(() => {
            logger.warn(`Command timeout reached (${timeoutMs}ms). Killing process tree...`);
            killProcessTree();
            resolve({
                success: false,
                stdout: trimOutput(stdoutData),
                stderr: trimOutput(stderrData) + '\n[ERROR] Process timed out.',
                exitCode: -1,
                durationMs: Date.now() - startTime,
            });
        }, timeoutMs);

        child.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderrData += data.toString();
        });

        child.on('close', (code) => {
            clearTimeout(timeoutId);
            logger.info(`Command completed with exit code ${code}`);

            // If this command started a process, remember it so quick repeated attempts are skipped
            if (procName && code === 0) {
                recentCommands.set(command, Date.now());
            }

            resolve({
                success: code === 0,
                stdout: trimOutput(stdoutData),
                stderr: trimOutput(stderrData),
                exitCode: code ?? -1,
                durationMs: Date.now() - startTime,
            });
        });

        child.on('error', (err) => {
            clearTimeout(timeoutId);
            logger.error(`Command execution error: ${err.message}`);
            resolve({
                success: false,
                stdout: trimOutput(stdoutData),
                stderr: trimOutput(stderrData) + `\n[ERROR] ${err.message}`,
                exitCode: -1,
                durationMs: Date.now() - startTime,
            });
        });
    });
}

/**
 * Truncate output to avoid breaking LLM context windows.
 * Retains the trailing edge mostly if truncated.
 */
function trimOutput(output: string, maxLength: number = CLI_OUTPUT_MAX_LENGTH): string {
    if (output.length <= maxLength) return output;
    return `...[TRUNCATED ${output.length - maxLength} chars]...\n` + output.slice(-(maxLength - 100));
}
