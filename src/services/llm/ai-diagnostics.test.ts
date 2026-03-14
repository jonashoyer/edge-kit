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
      text: '{"name": "broken"',
      cause: new Error('Unexpected end of JSON input'),
    });

    const noObjectGenerated = new NoObjectGeneratedError({
      message: 'No object generated: could not parse the response.',
      cause: parseError,
      text: '{"name": "broken"',
      response: {} as never,
      usage: {} as never,
      finishReason: 'stop' as never,
    });

    const diagnostics = buildAiDiagnosticsFromError({
      stage: 'object_generation',
      error: noObjectGenerated,
      summary: 'Failed to generate object',
    });

    expect(diagnostics.stage).toBe('object_generation');
    expect(diagnostics.finishReason).toBe('stop');
    expect(diagnostics.rawTextSnippet).toContain('{"name": "broken"');
    expect(diagnostics.issues[0]?.message).toContain('JSON parsing failed');
  });

  it('extracts nested validation issue paths', () => {
    const validationError = new TypeValidationError({
      value: { sections: [{ name: 123 }] },
      cause: {
        issues: [
          {
            path: ['sections', 0, 'name'],
            message: 'Expected string, received number',
            expected: 'string',
            received: 'number',
          },
        ],
      },
    });

    const diagnostics = buildAiDiagnosticsFromError({
      stage: 'schema_validation',
      error: validationError,
      summary: 'Validation failed',
      rawObject: { sections: [{ name: 123 }] },
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
        stage: 'mapping',
        errorType: 'InvariantError',
        summary: 'Missing section',
        issues: [{ path: '$.sections', message: 'Missing section' }],
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
