import { seedRandomNumberGenerator } from '../../utils/randomUtils';

export interface ClientFeatureFlag {
  name: string;
  isEnabled: boolean;
  rolloutPercentage: number;
}

export class ClientFeatureFlagService<T extends string> {
  private flags: Map<T, ClientFeatureFlag>;

  constructor(flags: Partial<Record<T, ClientFeatureFlag>>) {
    this.flags = new Map(Object.entries(flags) as [T, ClientFeatureFlag][]);
  }

  /**
   * Check if a feature flag is enabled for a specific user
   * @param name The name of the feature flag
   * @param userId The ID of the user
   * @returns A boolean indicating whether the feature is enabled for the user
   */
  isEnabled(name: T, userId: string) {
    const flag = this.flags.get(name);
    if (!flag) return false;
    if (!flag.isEnabled) return false;
    if (flag.rolloutPercentage >= 1) return true;

    const generator = seedRandomNumberGenerator(`${name}:${userId}`);
    return generator() < flag.rolloutPercentage;
  }


  /**
   * Set a feature flag
   * @param name The name of the feature flag
   * @param isEnabled Whether the feature is enabled
   * @param rolloutPercentage The percentage of users who should have the feature enabled (0-1)
   */
  setFlag(name: T, isEnabled: boolean, rolloutPercentage: number = 1) {
    this.flags.set(name, { name, isEnabled, rolloutPercentage });
  }

  /**
   * Get all feature flags
   * @returns An array of all feature flags
   */
  getAllFlags() {
    return Array.from(this.flags.values());
  }

  /**
   * Remove a feature flag
   * @param name The name of the feature flag to remove
   */
  removeFlag(name: T) {
    this.flags.delete(name);
  }
}


export const clientFeatureFlag = new ClientFeatureFlagService<string>({});