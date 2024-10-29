import { seedRandomNumberGenerator } from "../../utils/randomUtils";

export interface BaseFeatureFlag {
  disabled?: boolean;
}

export interface EnabledFeatureFlag extends BaseFeatureFlag {
  enabled: boolean;
}

export interface RolloutPercentageFeatureFlag extends BaseFeatureFlag {
  rolloutPercentage: number;
}

/**
 * Gradual rollout feature flag in steps by `rolloutInterval`
 */
export interface GradualRolloutFeatureFla extends BaseFeatureFlag {
  /**
   * The initial percentage of users to rollout to
   */
  initialRolloutPercentage: number;

  /**
   * The maximum percentage of users to rollout to
   */
  maxRolloutPercentage?: number;

  /**
   * The incremental percentage of users to rollout to at each interval
   */
  incrementalRolloutPercentage: number;
  /**
   * The interval between each incremental rollout percentage increase
   */
  rolloutInterval: number;
  /**
   * The origin timestamp for the gradual rollout
   */
  originTimestamp: number;
}

export type FeatureFlag = EnabledFeatureFlag | RolloutPercentageFeatureFlag | GradualRolloutFeatureFla;

export class FeatureFlagService<T extends string = string> {
  protected flags: Map<T, FeatureFlag & { name: T }>;
  constructor(flags: Partial<Record<T, FeatureFlag>> = {}) {
    const entries = Object.entries(flags) as [T, FeatureFlag][];
    this.flags = new Map(entries.map(([name, flag]) => [name, { ...flag, name }]));
  }

  addFlag(name: T, flag: FeatureFlag) {
    this.flags.set(name, { ...flag, name });
  }

  /**
   * Remove a feature flag
   * @param name The name of the feature flag to remove
   */
  deleteFlag(name: T) {
    this.flags.delete(name);
  }

  /**
   * Get all feature flags
   * @returns An array of all feature flags
   */
  getAllFlags() {
    return Array.from(this.flags.values());
  }


  public isEnabled(name: T, identifier?: string) {
    const flag = this.flags.get(name);
    if (!flag) return false;
    if (flag.disabled) return false;

    if ('enabled' in flag) return flag.enabled;
    if ('rolloutPercentage' in flag) return this.isEnabledRolloutPercentage(name, identifier, flag);
    if ('rolloutInterval' in flag) return this.isEnabledGradualRollout(name, identifier, flag);

    return false;
  }

  private isEnabledRolloutPercentage(name: string, identifier: string | undefined, flag: RolloutPercentageFeatureFlag) {
    if (flag.rolloutPercentage >= 1) return true;

    if (!identifier) {
      console.trace(`[FeatureFlag] [WARN] Feature flag ${name} is enabled but no identifier was provided`);
      return false;
    }

    const generator = seedRandomNumberGenerator(`${name}:${identifier}`);
    return generator() < flag.rolloutPercentage;
  }

  private isEnabledGradualRollout(name: string, identifier: string | undefined, flag: GradualRolloutFeatureFla) {
    const now = Date.now();
    const step = Math.floor((now - flag.originTimestamp) / flag.rolloutInterval);
    const percentage = Math.min(flag.initialRolloutPercentage + (flag.incrementalRolloutPercentage * step), flag.maxRolloutPercentage ?? 1);

    if (percentage >= 1) return true;


    if (!identifier) {
      console.trace(`[FeatureFlag] [WARN] Feature flag ${name} is enabled but no identifier was provided`);
      return false;
    }

    const generator = seedRandomNumberGenerator(`${name}:${identifier}`);
    return generator() < percentage;
  }
}

/*
const featureFlags = new FeatureFlagService({
  NEW_UI: { enabled: true },
  BETA_FEATURE: { rolloutPercentage: 0.25 },
  GRADUAL_ROLLOUT: {

    // 10% of users are always enabled
    initialRolloutPercentage: 0.1,

    // Maximum percentage of users to rollout to
    maxRolloutPercentage: 0.9,

    // Increased by 10% every 24 hours
    incrementalRolloutPercentage: 0.1,

    // Rolled out to 90% 8 days after originTimestamp
    rolloutInterval: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    originTimestamp: 1730243782269,
  }
});

// Check if features are enabled
const userId = 'user123';
console.log(featureFlags.isEnabled('NEW_UI'));           // true
console.log(featureFlags.isEnabled('BETA_FEATURE', userId));  // true/false based on userId
console.log(featureFlags.isEnabled('GRADUAL_ROLLOUT', userId));  // true/false based on userId and time
*/