import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertOptions } from '../alerting/abstract-alerting';
import { AbstractAlertingService } from '../alerting/abstract-alerting';
import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import { AbstractLogger } from '../logging/abstract-logger';
import {
  type CaptureConfig,
  ErrorEscalationService,
} from './error-escalation-service';
import { getInternalErrorHash } from './internal-error-persistence';
import { createTrpcErrorEscalationHandler } from './trpc-error-escalation';

class TestLogger extends AbstractLogger {
  log() {}
}

class TestAlertingService extends AbstractAlertingService {
  readonly alerts: Array<{ message: string; options: AlertOptions }> = [];

  constructor() {
    super(new TestLogger());
  }

  async alert(message: string, options: AlertOptions) {
    this.alerts.push({ message, options });
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ErrorEscalationService threshold cooldown', () => {
  it('alerts at the threshold and alerts again after the cooldown', async () => {
    vi.useFakeTimers();
    const alerting = new TestAlertingService();
    const service = new ErrorEscalationService(
      new InMemoryKeyValueService(),
      alerting
    );
    const config: CaptureConfig = {
      groupId: 'fingerprint',
      name: 'Repeated client error',
      rules: [
        {
          cooldownSeconds: 24 * 60 * 60,
          count: 3,
          type: 'threshold',
          windowSeconds: 2 * 24 * 60 * 60,
        },
      ],
      severity: 'error',
    };

    await service.capture(new Error('failure'), config);
    await service.capture(new Error('failure'), config);
    expect(alerting.alerts).toHaveLength(0);

    const thresholdError = new Error('failure');
    thresholdError.stack = 'RAW_STACK_CONTEXT';
    await service.capture(thresholdError, config);
    await service.capture(new Error('failure'), config);
    expect(alerting.alerts).toHaveLength(1);
    expect(alerting.alerts[0]?.message).toContain('RAW_STACK_CONTEXT');

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    await service.capture(new Error('failure'), config);
    expect(alerting.alerts).toHaveLength(2);
  });
});

describe('ErrorEscalationService error details', () => {
  it('includes config.message and keeps the diagnostics link in a truncated alert', async () => {
    const alerting = new TestAlertingService();
    const escalation = new ErrorEscalationService(
      new InMemoryKeyValueService(),
      alerting
    );
    const handler = createTrpcErrorEscalationHandler({
      errorLookupBaseUrl: 'https://app.example.com',
      getEscalation: () => escalation,
    });
    const error = Object.assign(new Error('x'.repeat(8000)), {
      code: 'INTERNAL_SERVER_ERROR',
    });

    await handler({ error, path: 'example.operation', type: 'mutation' });

    const message = alerting.alerts[0]?.message ?? '';
    expect(message).toContain('HTTP 500, procedure: example.operation');
    expect(message).toContain(
      `https://app.example.com/admin/errors?hash=${getInternalErrorHash(error.message)}`
    );
    expect(message).toContain('... (truncated)');
    expect(message.length).toBeLessThan(3000);
  });

  it('renders nested error details and causes without duplicating query strings', async () => {
    const alerting = new TestAlertingService();
    const service = new ErrorEscalationService(
      new InMemoryKeyValueService(),
      alerting
    );
    const providerError = Object.assign(new Error('Request was rejected'), {
      requestId: 'req_123',
      retryAfterMs: 5000,
    });
    const queryError = Object.assign(
      new Error('Failed query: delete from program where program.id = ?', {
        cause: providerError,
      }),
      {
        query: 'delete from program where program.id = ?',
      }
    );
    const outerError = Object.assign(
      new Error('Internal error', { cause: queryError }),
      {
        traceId: 'trace_123',
      }
    );

    await service.capture(outerError, {
      message: 'Failed during mutation',
      name: 'tRPC server error',
      rules: [{ type: 'always' }],
      severity: 'error',
    });

    expect(alerting.alerts).toHaveLength(1);
    const message = alerting.alerts[0]?.message;
    expect(message).toContain('Failed during mutation');
    expect(message).toContain('Caused by:');
    expect(message).toContain('"traceId":"trace_123"');
    expect(message).toContain('"requestId":"req_123"');
    expect(message).toContain('"retryAfterMs":5000');
    expect(message).toContain('Request was rejected');
    expect(message).not.toContain('Details: {"query"');
  });

  it('does not add empty detail or cause sections for a plain error', async () => {
    const alerting = new TestAlertingService();
    const service = new ErrorEscalationService(
      new InMemoryKeyValueService(),
      alerting
    );

    await service.capture(new Error('plain failure'), {
      name: 'plain error',
      rules: [{ type: 'always' }],
      severity: 'error',
    });

    expect(alerting.alerts).toHaveLength(1);
    const message = alerting.alerts[0]?.message;
    expect(message).not.toContain('Details:');
    expect(message).not.toContain('Caused by:');
  });
});
