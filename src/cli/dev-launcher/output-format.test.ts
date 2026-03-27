import { describe, expect, it } from 'vitest';
import {
  formatDevLauncherStructuredOutput,
  resolveDevLauncherCommandOutputFormat,
} from './output-format';

describe('output-format', () => {
  it('prefers --json over --toon', () => {
    expect(
      resolveDevLauncherCommandOutputFormat({
        json: true,
        toon: true,
      })
    ).toBe('json');
  });

  it('uses TOON output when requested', () => {
    expect(
      resolveDevLauncherCommandOutputFormat({
        toon: true,
      })
    ).toBe('toon');
  });

  it('formats structured output as TOON', () => {
    expect(
      formatDevLauncherStructuredOutput(
        {
          ok: true,
          stopped: true,
        },
        'toon'
      )
    ).toBe('ok: true\nstopped: true');
  });
});
