# Feature Flag Services

Edge Kit provides a robust feature flag implementation that allows you to gradually roll out features, conduct A/B testing, and toggle functionality without code deployments.

## Overview

The feature flag services allow you to:

- Enable or disable features for all users
- Roll out features to a percentage of users
- Implement phased rollouts with gradual increases
- Make feature decisions based on user identifiers for consistency

## Feature Flag Service

Edge Kit provides a flexible `FeatureFlagService` that supports multiple flag types:

**Location**: `src/services/feature-flag/feature-flag.ts`

**Available Flag Types**:

1. **Enabled Flag**: Simple on/off toggle for all users
2. **Rollout Percentage Flag**: Enables a feature for a specific percentage of users
3. **Phased Rollout Flag**: Gradually increases the percentage of users with access over time

## Usage

### Basic Setup

```typescript
import { FeatureFlagService } from '../services/feature-flag/feature-flag';

// Define typed feature flags (optional but recommended)
type MyFeatureFlags = 'NEW_UI' | 'BETA_FEATURE' | 'GRADUAL_ROLLOUT';

// Create a feature flag service with initial flags
const featureFlags = new FeatureFlagService<MyFeatureFlags>({
  // Simple on/off flag
  NEW_UI: { enabled: true },

  // Percentage rollout flag (25% of users)
  BETA_FEATURE: { rolloutPercentage: 0.25 },

  // Gradual rollout flag
  GRADUAL_ROLLOUT: {
    // 10% of users are initially enabled
    initialRolloutPercentage: 0.1,

    // Maximum percentage to reach
    maxRolloutPercentage: 0.9,

    // Increase by 10% every 24 hours
    incrementalRolloutPercentage: 0.1,

    // Interval between increases (in milliseconds)
    rolloutInterval: 24 * 60 * 60 * 1000, // 24 hours

    // Starting timestamp for the phased rollout
    originTimestamp: Date.now(),
  },
});
```

### Checking Feature Availability

```typescript
// Check a simple on/off flag (no user ID needed)
if (featureFlags.isEnabled('NEW_UI')) {
  // Render the new UI
} else {
  // Render the old UI
}

// Check a percentage-based flag (requires user ID for consistency)
const userId = 'user-123';
if (featureFlags.isEnabled('BETA_FEATURE', userId)) {
  // Show the beta feature to this user
} else {
  // Hide the beta feature from this user
}

// Check a gradual rollout flag (also requires user ID)
if (featureFlags.isEnabled('GRADUAL_ROLLOUT', userId)) {
  // Show the gradually rolling out feature
} else {
  // Hide the feature
}
```

### Dynamic Flag Management

```typescript
// Add a new flag dynamically
featureFlags.addFlag('NEW_FEATURE', { enabled: true });

// Add a percentage rollout flag
featureFlags.addFlag('LIMITED_RELEASE', { rolloutPercentage: 0.1 });

// Remove a flag
featureFlags.deleteFlag('DEPRECATED_FEATURE');

// Get all flags (for admin UI, etc.)
const allFlags = featureFlags.getAllFlags();
```

## Flag Types in Detail

### Enabled Flag

The simplest type that turns a feature on or off for all users:

```typescript
interface EnabledFeatureFlag {
  enabled: boolean;
  disabled?: boolean; // Optional override
}

// Example
{
  NEW_UI: {
    enabled: true;
  }
}
```

### Rollout Percentage Flag

Enables a feature for a specific percentage of users:

```typescript
interface RolloutPercentageFeatureFlag {
  rolloutPercentage: number; // 0.0 to 1.0
  disabled?: boolean; // Optional override
}

// Example
{
  BETA_FEATURE: {
    rolloutPercentage: 0.25;
  } // 25% of users
}
```

### Phased Rollout Flag

Gradually increases the percentage of users with access over time:

```typescript
interface PhasedRolloutFeatureFlag {
  initialRolloutPercentage: number; // Starting percentage
  maxRolloutPercentage?: number; // Maximum percentage (default: 1.0)
  incrementalRolloutPercentage: number; // Percentage increase per interval
  rolloutInterval: number; // Milliseconds between increases
  originTimestamp: number; // Starting timestamp for the phased rollout
  disabled?: boolean; // Optional override
}

// Example
{
  GRADUAL_ROLLOUT: {
    initialRolloutPercentage: 0.1, // Start with 10%
    maxRolloutPercentage: 0.9, // Max 90%
    incrementalRolloutPercentage: 0.1, // +10% each interval
    rolloutInterval: 24 * 60 * 60 * 1000, // 24 hours between increases
    originTimestamp: 1730243782269, // Starting timestamp
  }
}
```

## Common Use Cases

### Simple Feature Toggles

```typescript
// Define flags
const featureFlags = new FeatureFlagService({
  DARK_MODE: { enabled: true },
  ANALYTICS: { enabled: process.env.NODE_ENV === 'production' },
  MAINTENANCE_MODE: { enabled: false },
});

// Usage in code
if (featureFlags.isEnabled('DARK_MODE')) {
  // Use dark mode theme
}

if (featureFlags.isEnabled('ANALYTICS')) {
  // Initialize analytics
}

if (featureFlags.isEnabled('MAINTENANCE_MODE')) {
  // Show maintenance page
}
```

### A/B Testing

```typescript
// Define flags for A/B test
const featureFlags = new FeatureFlagService({
  NEW_CHECKOUT_FLOW: { rolloutPercentage: 0.5 }, // 50% of users (A/B test)
});

// In your component
function CheckoutPage({ userId }) {
  // Determine which variant to show (consistently for the same user)
  const useNewCheckout = featureFlags.isEnabled('NEW_CHECKOUT_FLOW', userId);

  // Track which variant the user saw
  analytics.track('checkout_view', {
    variant: useNewCheckout ? 'new' : 'control',
    userId,
  });

  // Render the appropriate variant
  return useNewCheckout ? <NewCheckout /> : <OldCheckout />;
}
```

### Gradual Feature Rollout

```typescript
// Define a gradual rollout
const featureFlags = new FeatureFlagService({
  NEW_EDITOR: {
    initialRolloutPercentage: 0.05, // Start with 5% of users
    maxRolloutPercentage: 1.0, // Eventually reach 100%
    incrementalRolloutPercentage: 0.05, // +5% each interval
    rolloutInterval: 7 * 24 * 60 * 60 * 1000, // 7 days between increases
    originTimestamp: Date.now(), // Start now
  },
});

// In your component
function EditorPage({ userId }) {
  // Check if this user gets the new editor
  const showNewEditor = featureFlags.isEnabled('NEW_EDITOR', userId);

  return showNewEditor ? <NewEditor /> : <LegacyEditor />;
}
```

### Feature Flag Administration

```typescript
// Admin component to manage feature flags
function FeatureFlagAdmin() {
  const [flags, setFlags] = useState(featureFlags.getAllFlags());

  // Toggle a simple flag
  function toggleFlag(flagName) {
    const flag = flags.find(f => f.name === flagName);

    if ('enabled' in flag) {
      featureFlags.addFlag(flagName, { enabled: !flag.enabled });
      setFlags(featureFlags.getAllFlags());
    }
  }

  // Adjust a percentage rollout
  function adjustPercentage(flagName, newPercentage) {
    featureFlags.addFlag(flagName, { rolloutPercentage: newPercentage });
    setFlags(featureFlags.getAllFlags());
  }

  // Render admin UI
  return (
    <div>
      <h1>Feature Flag Administration</h1>
      <table>
        <thead>
          <tr>
            <th>Flag Name</th>
            <th>Type</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {flags.map(flag => (
            <tr key={flag.name}>
              <td>{flag.name}</td>
              <td>{getFlagType(flag)}</td>
              <td>{getFlagStatus(flag)}</td>
              <td>
                {/* Render appropriate controls based on flag type */}
                {renderFlagControls(flag, toggleFlag, adjustPercentage)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## Integration with User Identity

For consistent user experiences, especially with percentage-based rollouts, always use a consistent identifier:

```typescript
// User authentication hook example
function useUser() {
  const [user, setUser] = useState(null);

  // Load user on mount
  useEffect(() => {
    async function loadUser() {
      const userData = await fetchCurrentUser();
      setUser(userData);

      // Set user ID for analytics
      analytics.identify(userData.id);
    }

    loadUser();
  }, []);

  // Feature flag checker with user ID
  const hasFeature = useCallback((featureName) => {
    return featureFlags.isEnabled(featureName, user?.id);
  }, [user]);

  return { user, hasFeature };
}

// Component usage
function ProfilePage() {
  const { user, hasFeature } = useUser();

  if (!user) return <Loading />;

  return (
    <div>
      <h1>Profile: {user.name}</h1>

      {hasFeature('ENHANCED_PROFILE') && (
        <EnhancedProfileSection user={user} />
      )}

      {/* Other profile content */}
    </div>
  );
}
```

## Best Practices

1. **Use Consistent Identifiers**: For percentage and phased rollouts, always use the same identifier for a specific user:

```typescript
// Good: Uses consistent user ID
if (featureFlags.isEnabled('FEATURE_NAME', userId)) {
  // ...
}

// Bad: Uses random or changing identifiers
if (featureFlags.isEnabled('FEATURE_NAME', Math.random().toString())) {
  // User will get inconsistent experience!
}
```

2. **Descriptive Flag Names**: Use clear, descriptive names for feature flags:

```typescript
// Good: Clear, descriptive names
{
  NEW_USER_ONBOARDING: { enabled: true },
  ENHANCED_SEARCH_ALGORITHM: { rolloutPercentage: 0.25 },
}

// Bad: Vague or uninformative names
{
  FEATURE_1: { enabled: true },
  TEST: { rolloutPercentage: 0.25 },
}
```

3. **Feature Flag Cleanup**: Remove flags when they're no longer needed:

```typescript
// Once a feature is fully rolled out and stable, remove the flag
featureFlags.deleteFlag('FULLY_ADOPTED_FEATURE');

// Update code to remove the flag check
function Component() {
  // Before: Conditional based on flag
  // if (featureFlags.isEnabled('FULLY_ADOPTED_FEATURE')) {
  //   return <NewFeature />;
  // }
  // return <OldFeature />;

  // After: Feature is now the default
  return <NewFeature />;
}
```

4. **Test Both Variants**: Always test both enabled and disabled states:

```typescript
// In tests
test('Component renders correctly with feature enabled', () => {
  // Mock feature flag to return true
  jest.spyOn(featureFlags, 'isEnabled').mockImplementation((flag) => {
    return flag === 'TEST_FEATURE' ? true : false;
  });

  // Test the enabled state
  // ...
});

test('Component renders correctly with feature disabled', () => {
  // Mock feature flag to return false
  jest.spyOn(featureFlags, 'isEnabled').mockImplementation(() => false);

  // Test the disabled state
  // ...
});
```

5. **Default to Safe Behavior**: When a flag check fails, default to the safer option:

```typescript
try {
  if (featureFlags.isEnabled('EXPERIMENTAL_FEATURE', userId)) {
    // Use experimental feature
  } else {
    // Use stable feature
  }
} catch (error) {
  console.error('Feature flag check failed:', error);
  // Default to stable feature on error
  // Use stable feature
}
```

## Custom Extensions

You can extend the `FeatureFlagService` to add custom functionality:

```typescript
import { FeatureFlag, FeatureFlagService } from '../services/feature-flag/feature-flag';

// Extended feature flag service with remote flags
class RemoteFeatureFlagService<T extends string = string> extends FeatureFlagService<T> {
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(
    initialFlags: Partial<Record<T, FeatureFlag>> = {},
    private options: {
      apiUrl: string;
      syncIntervalMs: number;
      apiKey: string;
    },
  ) {
    super(initialFlags);
    this.startSync();
  }

  private startSync() {
    // Initial sync
    this.syncWithRemote();

    // Set up interval for regular syncing
    this.syncInterval = setInterval(() => {
      this.syncWithRemote();
    }, this.options.syncIntervalMs);
  }

  private async syncWithRemote() {
    try {
      const response = await fetch(this.options.apiUrl, {
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch flags: ${response.statusText}`);
      }

      const remoteFlags = await response.json();

      // Update all flags from remote
      for (const [name, flag] of Object.entries(remoteFlags)) {
        this.addFlag(name as T, flag as FeatureFlag);
      }

      console.log('Feature flags synced successfully');
    } catch (error) {
      console.error('Failed to sync feature flags:', error);
    }
  }

  cleanup() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Usage
const remoteFlags = new RemoteFeatureFlagService(
  {
    // Local defaults (used until remote flags are fetched)
    NEW_UI: { enabled: false },
  },
  {
    apiUrl: 'https://api.example.com/feature-flags',
    syncIntervalMs: 5 * 60 * 1000, // 5 minutes
    apiKey: process.env.FLAGS_API_KEY!,
  },
);

// Clean up on application shutdown
process.on('SIGTERM', () => {
  remoteFlags.cleanup();
});
```
