/** biome-ignore-all lint/suspicious/noConsole: console is allowed */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  DependencyResolver,
  FeatureRegistry,
  featureBundleToXml,
  featureListToXml,
} from './mcp-utils.js';
import {
  COPY_PASTE_INTEGRATION_PROMPT,
  renderCopyPasteIntegrationPrompt,
} from './prompts/copy-paste-integration.js';
import { USAGE_GUIDELINES } from './resources/usage-guidelines.js';

// Initialize registry
const registry = new FeatureRegistry();
const resolver = new DependencyResolver();

const server = new Server(
  {
    name: 'edge-kit-mcp-server',
    title:
      'Edge Kit MCP Server - The standardized and unified Copy-paste-ready TypeScript feature component and functionality collection',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_features',
        description:
          "Discover copy-paste-ready Edge Kit features. Returns services (e.g., 'stripe', 's3-storage'), utilities, and composers with their IDs and descriptions so you can choose what source code to copy into a target repository.",
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_feature',
        description:
          "Retrieve the complete source code, local dependencies, and required third-party npm packages for a specific feature by its ID (e.g., 'stripe'). Copy the returned files into the target codebase; do not import `edge-kit` as a package.",
        inputSchema: {
          type: 'object',
          properties: {
            feature_id: {
              type: 'string',
              description:
                "The ID of the feature to retrieve (e.g., 'stripe', 'storage/s3-storage')",
            },
          },
          required: ['feature_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [COPY_PASTE_INTEGRATION_PROMPT],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== COPY_PASTE_INTEGRATION_PROMPT.name) {
    throw new Error('Prompt not found');
  }

  const featureId = request.params.arguments?.feature_id;
  const targetPath = request.params.arguments?.target_path;

  return {
    description: COPY_PASTE_INTEGRATION_PROMPT.description,
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: renderCopyPasteIntegrationPrompt({
            featureId,
            targetPath,
          }),
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Ensure registry is initialized
  await registry.init();

  if (request.params.name === 'list_features') {
    const features = registry.list();
    return {
      content: [
        {
          type: 'text',
          text: featureListToXml(features),
        },
      ],
    };
  }

  if (request.params.name === 'get_feature') {
    const args = z
      .object({
        feature_id: z.string(),
      })
      .parse(request.params.arguments);

    const feature = registry.get(args.feature_id);
    if (!feature) {
      throw new Error(
        `Feature "${args.feature_id}" not found. Use list_features to see available options.`
      );
    }

    const bundle = resolver.resolve(feature.entryPoint);

    // Attach the feature metadata to the bundle
    bundle.feature = feature;

    return {
      content: [
        {
          type: 'text',
          text: featureBundleToXml(bundle),
        },
      ],
    };
  }

  throw new Error('Tool not found');
});

// Resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'edge-kit://guidelines/usage',
        name: 'Usage Guidelines',
        mimeType: 'text/markdown',
        description:
          'Instructions for copying Edge Kit feature bundles into a target codebase',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === 'edge-kit://guidelines/usage') {
    return {
      contents: [
        {
          uri: 'edge-kit://guidelines/usage',
          mimeType: 'text/markdown',
          text: USAGE_GUIDELINES,
        },
      ],
    };
  }

  throw new Error('Resource not found');
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Edge Kit MCP Server running on stdio');
}

main();
