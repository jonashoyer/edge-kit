import { clamp } from '../../utils/number-utils';
import type { AbstractLogger } from '../logging/abstract-logger';
import type {
  FeatureFlag,
  FeatureFlagService,
  PhasedRolloutFeatureFla,
} from './feature-flag';

export type EnabledFlagStatus<T extends string> = {
  name: T;
  kind: 'enabled';
  disabled?: boolean;
  effective: boolean;
  details: { value: boolean };
};

export type PercentageFlagStatus<T extends string> = {
  name: T;
  kind: 'percentage';
  disabled?: boolean;
  effective: boolean;
  details: { rolloutPercentage: number };
};

export type PhasedFlagStatus<T extends string> = {
  name: T;
  kind: 'phased';
  disabled?: boolean;
  effective: boolean;
  details: {
    currentPercentage: number;
    step: number;
    nextStepAt: number;
    stepsToMax: number;
    etaToMax: number;
    maxRolloutPercentage: number;
    originTimestamp: number;
    rolloutInterval: number;
    incrementalRolloutPercentage: number;
    initialRolloutPercentage: number;
  };
};

export type FeatureFlagStatus<T extends string> =
  | EnabledFlagStatus<T>
  | PercentageFlagStatus<T>
  | PhasedFlagStatus<T>;

export type ComputeStatusesOptions = {
  now?: number;
  logger?: AbstractLogger;
};

export function computeFeatureFlagStatuses<T extends string>(
  service: FeatureFlagService<T>,
  options: ComputeStatusesOptions = {}
): FeatureFlagStatus<T>[] {
  const { now = Date.now(), logger } = options;
  const flags = service.getAllFlags();

  return flags.map((flagWithName) =>
    computeSingleFlagStatus<T>(
      flagWithName as FeatureFlag & { name: T },
      now,
      logger
    )
  );
}

function computeSingleFlagStatus<T extends string>(
  flagWithName: FeatureFlag & { name: T },
  now: number,
  logger?: AbstractLogger
): FeatureFlagStatus<T> {
  const name = flagWithName.name as T;
  const flag = flagWithName;

  if (flag.disabled) {
    if ('enabled' in flag) {
      return {
        name,
        kind: 'enabled',
        disabled: true,
        effective: false,
        details: { value: flag.enabled },
      };
    }
    if ('rolloutPercentage' in flag) {
      return {
        name,
        kind: 'percentage',
        disabled: true,
        effective: false,
        details: {
          rolloutPercentage: normalizePercentage(
            flag.rolloutPercentage,
            logger,
            name
          ),
        },
      };
    }
    if ('rolloutInterval' in flag) {
      const phased = computePhasedRolloutStats(flag, now, logger, name);
      return {
        name,
        kind: 'phased',
        disabled: true,
        effective: false,
        details: phased,
      };
    }
  }

  if ('enabled' in flag) {
    return {
      name,
      kind: 'enabled',
      effective: flag.enabled === true,
      details: { value: flag.enabled === true },
    };
  }

  if ('rolloutPercentage' in flag) {
    const rolloutPercentage = normalizePercentage(
      flag.rolloutPercentage,
      logger,
      name
    );
    return {
      name,
      kind: 'percentage',
      effective: rolloutPercentage >= 1,
      details: { rolloutPercentage },
    };
  }

  if ('rolloutInterval' in flag) {
    const phased = computePhasedRolloutStats(flag, now, logger, name);
    return {
      name,
      kind: 'phased',
      effective: phased.currentPercentage >= 1,
      details: phased,
    };
  }

  logger?.warn('Unknown feature flag shape', { name });
  return { name, kind: 'enabled', effective: false, details: { value: false } };
}

function normalizePercentage(
  percentage: number,
  logger: AbstractLogger | undefined,
  name: string
) {
  if (!Number.isFinite(percentage)) {
    logger?.warn('Invalid rolloutPercentage: not finite', { name, percentage });
    return 0;
  }
  return clamp(percentage, 0, 1);
}

export function computePhasedRolloutStats(
  flag: PhasedRolloutFeatureFla,
  now: number,
  logger?: AbstractLogger,
  name?: string
): PhasedFlagStatus<string>['details'] {
  const origin = flag.originTimestamp;
  const interval = flag.rolloutInterval;
  const increment = flag.incrementalRolloutPercentage;
  const initial = flag.initialRolloutPercentage;
  const max = flag.maxRolloutPercentage ?? 1;

  // Validate inputs
  const invalid = [origin, interval, increment, initial, max].some(
    (n) => typeof n !== 'number' || !Number.isFinite(n)
  );
  if (invalid) {
    logger?.warn('Invalid phased rollout values', {
      name,
      origin,
      interval,
      increment,
      initial,
      max,
    });
  }

  const safeInterval = interval > 0 ? interval : 1;
  const safeIncrement = clamp(increment, 0, 1);
  const safeInitial = clamp(initial, 0, 1);
  const safeMax = clamp(max, 0, 1);

  const step = Math.max(0, Math.floor((now - origin) / safeInterval));
  const currentPercentage = clamp(
    safeInitial + safeIncrement * step,
    0,
    safeMax
  );

  const nextStepAt = origin + (step + 1) * safeInterval;

  const remaining = Math.max(0, safeMax - currentPercentage);
  const stepsToMax =
    safeIncrement > 0
      ? Math.ceil(remaining / safeIncrement)
      : Number.POSITIVE_INFINITY;

  const totalStepsToMax =
    safeIncrement > 0
      ? Math.ceil((safeMax - safeInitial) / safeIncrement)
      : Number.POSITIVE_INFINITY;
  const etaToMax = Number.isFinite(totalStepsToMax)
    ? origin + totalStepsToMax * safeInterval
    : Number.POSITIVE_INFINITY;

  return {
    currentPercentage,
    step,
    nextStepAt,
    stepsToMax,
    etaToMax,
    maxRolloutPercentage: safeMax,
    originTimestamp: origin,
    rolloutInterval: safeInterval,
    incrementalRolloutPercentage: safeIncrement,
    initialRolloutPercentage: safeInitial,
  };
}

/**
 * Example:
 * const service = new FeatureFlagService({
 *   NEW_UI: { enabled: true },
 *   BETA_FEATURE: { rolloutPercentage: 0.25 },
 *   GRADUAL: { initialRolloutPercentage: 0.1, incrementalRolloutPercentage: 0.1, rolloutInterval: 86_400_000, originTimestamp: 1_730_243_782_269 },
 * });
 * const statuses = computeFeatureFlagStatuses(service);
 */
