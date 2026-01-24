/** biome-ignore-all lint/suspicious/noConsole: console is allowed */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// 1. Initialize the server with a name and version
const server = new Server(
  {
    name: "edge-kit-mcp-server",
    title:
      "Edge Kit MCP Server - The standardized and unified component and functionality library",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {}, // We are exposing tools
    },
  }
);

// 2. Define the schema for listing tools
server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: "add_numbers",
        description: "Adds two numbers together",
        inputSchema: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        },
      },
    ],
  };
});

// 3. Define the handler for calling tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "add_numbers") {
    // Validate arguments using Zod (optional but recommended)
    const args = z
      .object({
        a: z.number(),
        b: z.number(),
      })
      .parse(request.params.arguments);

    return {
      content: [
        {
          type: "text",
          text: String(args.a + args.b),
        },
      ],
    };
  }

  throw new Error("Tool not found");
});

// 4. Connect the transport (Stdio is standard for local MCP)
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Edge Kit MCP Server running on stdio"); // Use stderr for logs, stdout is for protocol
}

main();
