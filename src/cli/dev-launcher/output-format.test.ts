import { describe, expect, it } from 'vitest';
import {
  formatDevLauncherStructuredOutput,
  resolveDevLauncherCommandOutputFormat,
} from './output-format';

describe('output-format', () => {
  it('uses text output by default', () => {
    expect(resolveDevLauncherCommandOutputFormat({})).toBe('text');
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
