import { CopilotClient, CopilotSession, defineTool } from '@github/copilot-sdk';
import { logger } from '../utils/logger.js';
import { REASONING_MODEL, REASONING_TIMEOUT_MS } from '../utils/config.js';
import { z } from 'zod';

export interface ToolDefinition {
    name: string;
    description: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: z.ZodObject<any>;
    handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export class ReasoningAgent {
    private client: CopilotClient;
    private session: CopilotSession | null = null;

    constructor() {
        this.client = new CopilotClient();
    }

    async initialize(systemMessage: string, tools: ToolDefinition[]) {
        try {
            logger.info('Initializing Copilot SDK Client...');
            await this.client.start();

            this.session = await this.client.createSession({
                model: REASONING_MODEL,
                systemMessage: {
                    mode: 'replace',
                    content: systemMessage
                },
                tools: tools.map(t => defineTool(t.name, {
                    description: t.description,
                    parameters: t.parameters,
                    handler: t.handler
                }))
            });

            // Debug listener for session events
            this.session.on((event) => {
                logger.debug(`[SDK Event] ${event.type}: ${JSON.stringify(event.data).substring(0, 200)}`);
            });

            logger.info('Copilot Session created successfully.');
        } catch (error) {
            logger.error('Failed to initialize Copilot reasoning agent:', error);
            throw error;
        }
    }

    async think(prompt: string, attachmentPath?: string): Promise<string | undefined> {
        if (!this.session) {
            throw new Error('Reasoning session not initialized.');
        }

        try {
            logger.info('Soliciting reasoning from Copilot...');

            const attachments: Array<{ type: 'file'; path: string }> = [];
            if (attachmentPath) {
                attachments.push({
                    type: 'file',
                    path: attachmentPath
                });
            }

            // The session.on listeners already log events like tool_execution_start.
            // We increase the timeout to 120s because tool chains can take time.
            const response = await this.session.sendAndWait({
                prompt,
                attachments
            }, REASONING_TIMEOUT_MS);

            // The SDK response shape may vary; safely access nested data
            const responseData = response as { data?: { content?: string } } | undefined;
            return responseData?.data?.content;
        } catch (error) {
            logger.error('Error during reasoning step:', error);
            return undefined;
        }
    }

    async cleanup() {
        if (this.session) {
            await this.session.destroy();
        }
        await this.client.stop();
    }
}
