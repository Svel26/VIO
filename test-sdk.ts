import { CopilotClient, defineTool } from '@github/copilot-sdk';

async function test() {
    const client = new CopilotClient();
    await client.start();

    const session = await client.createSession({
        model: 'gpt-4o',
        systemMessage: { mode: 'replace', content: 'You are a test assistant.' },
        tools: [
            defineTool('hello', {
                description: 'Says hello',
                parameters: { type: 'object', properties: {} },
                handler: async () => 'Hello back!'
            })
        ]
    });

    session.on(e => console.log('Event:', e.type));

    console.log('Sending message...');
    const response = await session.sendAndWait({ prompt: 'Say hello and use the hello tool.' });
    console.log('Response content:', (response as any)?.data?.content);

    await session.destroy();
    await client.stop();
}

test().catch(console.error);
