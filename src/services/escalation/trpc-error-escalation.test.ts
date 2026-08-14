import { describe, expect, it, vi } from 'vitest';
import type { CaptureConfig } from './error-escalation-service';
import {
  createTrpcErrorEscalationHandler,
  getTrpcErrorFingerprint,
} from './trpc-error-escalation';

const createError = (code: string, message = 'Request failed') =>
  Object.assign(new Error(message), { code });

describe('createTrpcErrorEscalationHandler', () => {
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
        rules: [{ type: 'always', intervalSeconds: 86_400 }],
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
            type: 'threshold',
            count: 3,
            windowSeconds: 3600,
            cooldownSeconds: 86_400,
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
      { type: 'always', intervalSeconds: 300 },
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
