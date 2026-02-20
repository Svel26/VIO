import { CopilotClient, CopilotSession, defineTool } from '@github/copilot-sdk';
import { logger } from '../utils/logger.js';

export class ReasoningAgent {
    private client: CopilotClient;
    private session: CopilotSession | null = null;

    constructor() {
        this.client = new CopilotClient();
    }

    async initialize(systemMessage: string, tools: any[]) {
        try {
            logger.info('Initializing Copilot SDK Client...');
            await this.client.start();

            this.session = await this.client.createSession({
                model: 'gpt-4o',
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

            const attachments: any[] = [];
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
            }, 120000);

            return (response as any)?.data?.content;
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
