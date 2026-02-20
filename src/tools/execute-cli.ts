import { spawn } from 'child_process';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

export const ExecuteCliSchema = z.object({
    command: z.string().describe('The shell command to execute.'),
    cwd: z.string().optional().describe('Optional working directory.'),
    timeoutMs: z.number().optional().describe('Maximum execution time in milliseconds (default 300000).'),
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
    const { command, cwd = process.cwd(), timeoutMs = 300000 } = params;

    logger.info(`Executing CLI command: "${command}" in ${cwd}`);
    const startTime = Date.now();

    return new Promise((resolve) => {
        // Determine shell block depending on platform for complex commands
        const child = spawn(command, [], {
            cwd,
            shell: true,
            env: process.env,
        });

        let stdoutData = '';
        let stderrData = '';

        const timeoutId = setTimeout(() => {
            logger.warn(`Command timeout reached (${timeoutMs}ms). Killing process...`);
            child.kill('SIGKILL');
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
function trimOutput(output: string, maxLength: number = 10000): string {
    if (output.length <= maxLength) return output;
    return `...[TRUNCATED ${output.length - maxLength} chars]...\n` + output.slice(-(maxLength - 100));
}
