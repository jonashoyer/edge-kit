import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlertOptions } from '../alerting/abstract-alerting';
import { AbstractAlertingService } from '../alerting/abstract-alerting';
import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import { AbstractLogger } from '../logging/abstract-logger';
import {
  type CaptureConfig,
  ErrorEscalationService,
} from './error-escalation-service';

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
