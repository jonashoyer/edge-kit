# LLM Services

## Notion MCP (HTTP client) integration

Edge Kit includes a small service for connecting to an MCP server over Streamable HTTP and exposing its tools to AI SDK calls.

### References

- https://developers.notion.com/docs/mcp-security-best-practices
- https://github.com/makenotion/notion-mcp-server
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#mcp-tools

### Server setup (Notion MCP)

Run the official server with HTTP transport:

```bash
AUTH_TOKEN=your-secret NOTION_TOKEN=ntn_**** npx -y @notionhq/notion-mcp-server --transport http --port 3000
```

### Client usage

```ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

import { NotionMcpHttpClient } from '@/services/mcp/notion-mcp-http-client';

const notion = await new NotionMcpHttpClient({
  url: 'http://localhost:3000/mcp',
  authToken: process.env.AUTH_TOKEN,
}).connect();

const tools = await notion.tools();

const { text } = await streamText({
  model: openai('gpt-4o'),
  tools,
  prompt: 'Comment "Hello MCP" on page "Getting started".',
});

await notion.close();
```

To restrict loaded tools and gain stronger typing, pass schemas:

```ts
const tools = await notion.tools({
  schemas: {
    'tool-name': {
      inputSchema: {
        /* zod or JSON schema */
      },
    },
  },
});
```

### Security

- Verify server URLs and use strong bearer tokens.
- Keep human confirmation for write operations in your app.
- Follow Notion’s guidance for least privilege and prompt injection awareness.
