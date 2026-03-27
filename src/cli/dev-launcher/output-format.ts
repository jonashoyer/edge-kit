import { encode } from '@toon-format/toon';
import type { DevLauncherCommandOutputFormat } from './types';

export class DevLauncherCommandError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export interface DevLauncherStructuredOutputOptions {
  json?: boolean;
  toon?: boolean;
}

export const resolveDevLauncherCommandOutputFormat = (
  options: DevLauncherStructuredOutputOptions
): DevLauncherCommandOutputFormat => {
  if (options.json) {
    return 'json';
  }

  if (options.toon) {
    return 'toon';
  }

  return 'text';
};

export const formatDevLauncherStructuredOutput = (
  value: unknown,
  format: DevLauncherCommandOutputFormat
): string => {
  if (format === 'json') {
    return JSON.stringify(value, null, 2);
  }

  if (format === 'toon') {
    return encode(value);
  }

  throw new DevLauncherCommandError(
    'invalid_output_format',
    `Structured output is not supported for format "${format}".`
  );
};
