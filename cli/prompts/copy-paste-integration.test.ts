import { describe, expect, it } from 'vitest';
import {
  COPY_PASTE_INTEGRATION_PROMPT,
  renderCopyPasteIntegrationPrompt,
} from './copy-paste-integration.js';

describe('copy-paste integration prompt', () => {
  it('describes the copy-paste workflow without a feature id', () => {
    const result = renderCopyPasteIntegrationPrompt({});

    expect(result).toContain('Edge Kit is copy-paste-first source');
    expect(result).toContain('Do not add `edge-kit` as a dependency.');
    expect(result).toContain('Call `list_features` first');
  });

  it('specializes the workflow when feature and target path are provided', () => {
    const result = renderCopyPasteIntegrationPrompt({
      featureId: 'stripe',
      targetPath: 'apps/web/src',
    });

    expect(result).toContain('`get_feature` with feature_id `stripe`');
    expect(result).toContain('under `apps/web/src`');
    expect(result).toContain('Install only the third-party npm packages');
  });

  it('keeps prompt metadata aligned with the server contract', () => {
    expect(COPY_PASTE_INTEGRATION_PROMPT.name).toBe(
      'copy_paste_feature_into_repo'
    );
    expect(COPY_PASTE_INTEGRATION_PROMPT.arguments).toHaveLength(2);
  });
});
