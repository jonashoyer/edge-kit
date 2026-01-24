/** biome-ignore-all lint/suspicious/noConsole: console is allowed */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  DependencyResolver,
  FeatureRegistry,
  featureBundleToXml,
  featureListToXml,
} from "./mcp-utils.js";

// Initialize registry
const registry = new FeatureRegistry();
const resolver = new DependencyResolver();

const server = new Server(
  {
    name: "edge-kit-mcp-server",
    title: "Edge Kit MCP Server - The standardized and unified component and functionality library",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_features",
        description: "Discover available features in the Edge Kit library. Returns a list of services (e.g., 'stripe', 's3-storage'), utilities, and composers with their IDs and descriptions. Use this to find the right component before calling `get_feature`.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_feature",
        description: "Retrieve the complete source code, local dependencies, and required npm packages for a specific feature by its ID (e.g., 'stripe'). Returns a bundle containing all necessary files to implement the feature in a target codebase.",
        inputSchema: {
          type: "object",
          properties: {
            feature_id: { 
              type: "string", 
              description: "The ID of the feature to retrieve (e.g., 'stripe', 'storage/s3-storage')" 
            },
          },
          required: ["feature_id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Ensure registry is initialized
  await registry.init();

  if (request.params.name === "list_features") {
    const features = registry.list();
    return {
      content: [
        {
          type: "text",
          text: featureListToXml(features),
        },
      ],
    };
  }

  if (request.params.name === "get_feature") {
    const args = z
      .object({
        feature_id: z.string(),
      })
      .parse(request.params.arguments);

    const feature = registry.get(args.feature_id);
    if (!feature) {
      throw new Error(`Feature "${args.feature_id}" not found. Use list_features to see available options.`);
    }

    const bundle = resolver.resolve(feature.entryPoint);
    
    // Attach the feature metadata to the bundle
    bundle.feature = feature;

    return {
      content: [
        {
          type: "text",
          text: featureBundleToXml(bundle),
        },
      ],
    };
  }

  throw new Error("Tool not found");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Edge Kit MCP Server running on stdio");
}

main();
