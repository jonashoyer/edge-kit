/**
 * @file cli/prompts/copy-paste-integration.ts
 * @description MCP prompt metadata and renderer for copy-paste-first integration.
 */

export const COPY_PASTE_INTEGRATION_PROMPT = {
  name: 'copy_paste_feature_into_repo',
  description:
    'Guide an agent to copy Edge Kit source files into a target repository instead of importing edge-kit as a package.',
  arguments: [
    {
      name: 'feature_id',
      description:
        'Optional Edge Kit feature ID to retrieve immediately with get_feature.',
      required: false,
    },
    {
      name: 'target_path',
      description:
        'Optional target repo path or source root to adapt copied files into.',
      required: false,
    },
  ],
} as const;

export interface CopyPastePromptArguments {
  featureId?: string;
  targetPath?: string;
}

export function renderCopyPasteIntegrationPrompt(
  args: CopyPastePromptArguments
): string {
  const steps = [
    'Edge Kit is copy-paste-first source, not a package you should import from at runtime.',
    'Do not add `edge-kit` as a dependency.',
    'Do not write imports from `edge-kit`, this MCP server, or this repository path.',
    args.featureId
      ? `Call \`get_feature\` with feature_id \`${args.featureId}\` to retrieve the complete bundle.`
      : 'Call `list_features` first, choose the best matching feature, then call `get_feature` for the selected feature ID.',
    'Copy the returned source files into the target repository and preserve their internal relationships.',
    args.targetPath
      ? `Adapt file paths and imports so the code lives naturally under \`${args.targetPath}\`.`
      : 'Adapt file paths and imports to the target repository structure instead of preserving Edge Kit paths blindly.',
    'Install only the third-party npm packages listed in `<npmDependencies>` if the target repository does not already provide them.',
    'Preserve constructor injection and abstract contracts; instantiate concrete services inside the target repository.',
    'When files already exist, merge carefully and keep existing project-specific behavior.',
  ];

  return steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
}
