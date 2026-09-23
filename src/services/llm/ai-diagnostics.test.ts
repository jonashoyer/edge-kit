import {
  JSONParseError,
  NoObjectGeneratedError,
  TypeValidationError,
} from 'ai';
import { describe, expect, it } from 'vitest';

import {
  AiDiagnosticError,
  buildAiDiagnosticsFromError,
  getAiDiagnostics,
} from './ai-diagnostics';

describe('ai diagnostics', () => {
  it('extracts finish reason and text snippets from NoObjectGeneratedError', () => {
    const parseError = new JSONParseError({
      cause: new Error('Unexpected end of JSON input'),
      text: '{"name": "broken"',
    });

    const noObjectGenerated = new NoObjectGeneratedError({
      cause: parseError,
      finishReason: 'stop' as never,
      message: 'No object generated: could not parse the response.',
      response: {} as never,
      text: '{"name": "broken"',
      usage: {} as never,
    });

    const diagnostics = buildAiDiagnosticsFromError({
      error: noObjectGenerated,
      stage: 'object_generation',
      summary: 'Failed to generate object',
    });

    expect(diagnostics.stage).toBe('object_generation');
    expect(diagnostics.finishReason).toBe('stop');
    expect(diagnostics.rawTextSnippet).toContain('{"name": "broken"');
    expect(diagnostics.issues[0]?.message).toContain('JSON parsing failed');
  });

  it('extracts nested validation issue paths', () => {
    const validationError = new TypeValidationError({
      cause: {
        issues: [
          {
            expected: 'string',
            message: 'Expected string, received number',
            path: ['sections', 0, 'name'],
            received: 'number',
          },
        ],
      },
      value: { sections: [{ name: 123 }] },
    });

    const diagnostics = buildAiDiagnosticsFromError({
      error: validationError,
      rawObject: { sections: [{ name: 123 }] },
      stage: 'schema_validation',
      summary: 'Validation failed',
    });

    expect(diagnostics.errorType).toBe('AI_TypeValidationError');
    expect(
      diagnostics.issues.some(
        (issue) =>
          issue.path.includes('sections') &&
          issue.message.includes('Expected string')
      )
    ).toBe(true);
    expect(diagnostics.rawObjectPreview).toContain('"name": 123');
  });

  it('traverses cause chains for AiDiagnosticError', () => {
    const diagnosticError = new AiDiagnosticError({
      diagnostics: {
        errorType: 'InvariantError',
        issues: [{ message: 'Missing section', path: '$.sections' }],
        stage: 'mapping',
        summary: 'Missing section',
      },
    });

    const wrappedError = new Error('wrapped', {
      cause: diagnosticError,
    });

    const diagnostics = getAiDiagnostics(wrappedError);

    expect(diagnostics?.stage).toBe('mapping');
    expect(diagnostics?.issues[0]?.message).toBe('Missing section');
  });
});
