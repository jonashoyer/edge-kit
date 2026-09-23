import { describe, expect, it, vi } from 'vitest';
import { fnv1a64 } from '../../utils/crypto-utils';
import type { CaptureConfig } from './error-escalation-service';
import {
  createTrpcErrorEscalationHandler,
  getTrpcErrorFingerprint,
} from './trpc-error-escalation';

const createError = (code: string, message = 'Request failed') =>
  Object.assign(new Error(message), { code });

describe('createTrpcErrorEscalationHandler', () => {
  it('hashes the canonical error identity with FNV-1a 64-bit', () => {
    const error = createError('INTERNAL_SERVER_ERROR');
    const canonicalError =
      'report.build:INTERNAL_SERVER_ERROR:Error:request failed';

    expect(getTrpcErrorFingerprint({ error, path: 'report.build' })).toBe(
      fnv1a64(canonicalError).toString(16)
    );
  });

  it('uses an immediate daily rule for 5xx errors', async () => {
    const capture = vi
      .fn<(error: unknown, config: CaptureConfig) => Promise<void>>()
      .mockResolvedValue();
    const error = createError('INTERNAL_SERVER_ERROR');
    const handler = createTrpcErrorEscalationHandler({
      environment: 'production',
      getEscalation: () => ({ capture }),
    });

    await handler({ error, path: 'report.build', type: 'mutation' });

    expect(capture).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        groupId: getTrpcErrorFingerprint({ error, path: 'report.build' }),
        rules: [{ intervalSeconds: 86_400, type: 'always' }],
      })
    );
  });

  it('uses a three-per-hour threshold and daily cooldown for 4xx errors', async () => {
    const capture = vi
      .fn<(error: unknown, config: CaptureConfig) => Promise<void>>()
      .mockResolvedValue();
    const handler = createTrpcErrorEscalationHandler({
      getEscalation: () => ({ capture }),
    });

    await handler({
      error: createError('BAD_REQUEST'),
      path: 'report.build',
      type: 'mutation',
    });

    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        rules: [
          {
            cooldownSeconds: 86_400,
            count: 3,
            type: 'threshold',
            windowSeconds: 3600,
          },
        ],
      })
    );
  });

  it('allows callers to replace rules for either error category', async () => {
    const capture = vi
      .fn<(error: unknown, config: CaptureConfig) => Promise<void>>()
      .mockResolvedValue();
    const clientErrorRules: CaptureConfig['rules'] = [
      { intervalSeconds: 300, type: 'always' },
    ];
    const handler = createTrpcErrorEscalationHandler({
      clientErrorRules,
      getEscalation: () => ({ capture }),
    });

    await handler({ error: createError('BAD_REQUEST') });

    expect(capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ rules: clientErrorRules })
    );
  });
});
