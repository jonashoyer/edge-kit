/**
 * @file cli/resources/usage-guidelines.ts
 * @description MCP Resource content served at URI `edge-kit://guidelines/usage`
 *
 * ## Integration
 * - Exported as `USAGE_GUIDELINES` (string constant)
 * - Consumed by `cli/mcp.ts` via `ReadResourceRequestSchema` handler
 * - Served with `mimeType: "text/markdown"`
 *
 * ## Consumer
 * - LLM agents (Claude, Cursor, etc.) read this resource via MCP `resources/read`
 * - Used as context to understand how to process `get_feature` tool output
 *
 * ## Constraints
 * - Must be valid Markdown (agents may render or parse it)
 * - Instructions must be procedural and unambiguous for LLM execution
 * - XML structure documentation must match `featureBundleToXml` output exactly
 */
export const USAGE_GUIDELINES = `
---
slug: /usage-guidelines
title: Usage Guidelines
sidebar_position: 1
---

You are integrating code from the Edge Kit library into a target codebase. Follow these instructions exactly when processing output from the \`get_feature\` tool.

## XML Bundle Structure

The \`get_feature\` tool returns XML with this structure:

\`\`\`xml
<bundle>
  <feature>
    <id>feature-id</id>
    <name>feature-name</name>
    <description>Feature description</description>
    <category>service|utility|composer|database</category>
    <entryPoint>src/path/to/entry.ts</entryPoint>
  </feature>
  <files>
    <files>
      <path>src/relative/path/file.ts</path>
      <content>// TypeScript source code</content>
    </files>
    <!-- Additional files -->
  </files>
  <npmDependencies>
    <package-name>^version</package-name>
    <!-- Additional dependencies -->
  </npmDependencies>
  <documentation>Optional markdown documentation</documentation>
</bundle>
\`\`\`

## Integration Procedure

Execute these steps in order:

### Step 1: Check NPM Dependencies

1. Extract all \`<package-name>\` elements from \`<npmDependencies>\`.
2. For each package, check if it exists in the target project's \`package.json\`.
3. If missing, install it:
   \`\`\`bash
   npm install <package-name>
   # or: pnpm add <package-name>
   # or: yarn add <package-name>
   \`\`\`
4. If the package exists but with a different version, keep the existing version unless incompatible.

### Step 2: Create Source Files

For each \`<files>\` element in the \`<files>\` array:

1. Extract the \`<path>\` value (e.g., \`src/services/stripe/index.ts\`).
2. Extract the \`<content>\` value (TypeScript source code).
3. **Conflict check**: If a file already exists at that path:
   - If the existing file is identical, skip.
   - If different, compare and merge (prefer keeping existing customizations).
   - For shared utilities (e.g., \`src/utils/type-utils.ts\`), check if existing exports are compatible.
4. Create the file at the specified path, creating directories as needed.

### Step 3: Adjust Import Paths

If the target project uses a different directory structure:

1. Modify file paths to match the target structure.
2. Update all import statements in the created files to reflect new paths.
3. Common adjustments:
   - \`src/services/\` → \`lib/services/\` or \`app/services/\`
   - \`src/utils/\` → \`lib/utils/\` or \`shared/\`

### Step 4: Configure the Service

1. Read the \`<documentation>\` section if present.
2. Identify required configuration:
   - **Environment variables**: Look for \`env.VARIABLE_NAME\` patterns.
   - **Constructor dependencies**: Check constructor parameters for required services (logger, kv store, etc.).
3. Add required environment variables to \`.env\` or \`.env.example\`.

## Dependency Injection Pattern

Edge Kit services use constructor injection. When instantiating a service:

\`\`\`typescript
// 1. Import the service and its dependencies
import { StripeService } from "./services/stripe";
import { ConsoleLogger } from "./services/logging/console-logger";
import { UpstashRedisKeyValueService } from "./services/key-value/upstash-redis-key-value";

// 2. Create dependency instances
const logger = new ConsoleLogger();
const kv = new UpstashRedisKeyValueService({
  url: env.UPSTASH_REDIS_URL,
  token: env.UPSTASH_REDIS_TOKEN,
});

// 3. Instantiate the service with dependencies
const stripeService = new StripeService(store, stripeClient, {
  logger,
  baseUrl: env.APP_BASE_URL,
  webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  secretKey: env.STRIPE_SECRET_KEY,
});
\`\`\`

## Common Patterns

| Pattern | Description |
|---------|-------------|
| \`Abstract*\` classes | Base contracts - do not instantiate directly |
| \`*Service\` classes | Main implementation - instantiate with dependencies |
| \`types.ts\` files | Type definitions - import types as needed |
| \`errors.ts\` files | Custom error classes - catch and handle appropriately |

## Verification Checklist

After integration, verify:

- [ ] All necessary files created
- [ ] All npm dependencies installed
- [ ] Import paths resolve correctly (no module not found errors)
- [ ] Required environment variables documented
`.trimStart();
