import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { AbstractLogger } from "../logging/abstract-logger";
import type { FeatureFlagService } from "./feature-flag";

type Nullable<T> = T | null | undefined;

export type FeatureFlagOverride = {
  // When true, forces the flag ON regardless of service evaluation
  enabled?: boolean;
};

type PerIdentifierOverrides = Record<string, FeatureFlagOverride>;

export type FeatureFlagOverridesState<T extends string> = Record<
  T,
  {
    global?: FeatureFlagOverride;
    byId?: PerIdentifierOverrides;
  }
>;

export type FeatureFlagOverridesProviderProps<T extends string> = {
  service: FeatureFlagService<T>;
  logger?: AbstractLogger;
  persist?: "local" | "none";
  prefix?: string;
  enable?: boolean;
};

type ResolveMeta = {
  source: "override" | "service";
  overridden: boolean;
  reason?: string;
};

export type FeatureFlagOverridesContextValue<T extends string> = {
  service: FeatureFlagService<T>;
  overrides: FeatureFlagOverridesState<T>;
  setOverride: (
    name: T,
    override: FeatureFlagOverride,
    identifier?: string
  ) => void;
  clearOverride: (name: T, identifier?: string) => void;
  resolve: (
    name: T,
    identifier?: string
  ) => { enabled: boolean; meta: ResolveMeta };
};

const FeatureFlagOverridesContext =
  createContext<Nullable<FeatureFlagOverridesContextValue<string>>>(null);

const DEFAULT_PREFIX = "ff";

function safeIsBrowser() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function storageKey(prefix: string) {
  return `${prefix}:overrides`;
}

export function FeatureFlagOverridesProvider<T extends string>(
  props: {
    children?: React.ReactNode;
  } & FeatureFlagOverridesProviderProps<T>
) {
  const {
    children,
    service,
    logger,
    persist = "local",
    prefix = DEFAULT_PREFIX,
    enable = true,
  } = props;

  const [overrides, setOverrides] = useState<FeatureFlagOverridesState<T>>(
    {} as FeatureFlagOverridesState<T>
  );
  const isBrowser = safeIsBrowser();
  const persistLocal = enable && persist === "local" && isBrowser;
  const keyRef = useRef(storageKey(prefix));

  // Load from localStorage once
  useEffect(() => {
    if (!persistLocal) {
      return;
    }
    try {
      const raw = window.localStorage.getItem(keyRef.current);
      if (raw) {
        const parsed = JSON.parse(raw) as FeatureFlagOverridesState<T>;
        setOverrides(parsed);
      }
    } catch {
      logger?.warn?.("Failed to load feature flag overrides from localStorage");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistLocal, logger]);

  // Persist on change
  useEffect(() => {
    if (!persistLocal) {
      return;
    }
    try {
      window.localStorage.setItem(keyRef.current, JSON.stringify(overrides));
    } catch {
      logger?.warn?.(
        "Failed to persist feature flag overrides to localStorage"
      );
    }
  }, [overrides, persistLocal, logger]);

  const setOverride = useCallback(
    (name: T, override: FeatureFlagOverride, identifier?: string) => {
      if (!enable) {
        return;
      }
      setOverrides((prev) => {
        const current = prev[name] ?? {};
        const next: FeatureFlagOverridesState<T> = { ...prev };
        if (identifier) {
          const byId = { ...(current.byId ?? {}) };
          byId[identifier] = { ...byId[identifier], ...override };
          next[name] = { ...current, byId } as FeatureFlagOverridesState<T>[T];
          return next;
        }
        next[name] = {
          ...current,
          global: { ...(current.global ?? {}), ...override },
        } as FeatureFlagOverridesState<T>[T];
        return next;
      });
    },
    [enable]
  );

  const clearOverride = useCallback(
    (name: T, identifier?: string) => {
      if (!enable) {
        return;
      }
      setOverrides((prev) => {
        const current = prev[name];
        if (!current) {
          return prev;
        }
        const next: FeatureFlagOverridesState<T> = { ...prev };
        if (identifier) {
          const byId = { ...(current.byId ?? {}) };
          if (byId[identifier]) {
            delete byId[identifier];
          }
          next[name] = { ...current, byId } as FeatureFlagOverridesState<T>[T];
          return next;
        }
        const { global: _discardGlobal, ...rest } = current;
        next[name] = { ...rest } as FeatureFlagOverridesState<T>[T];
        return next;
      });
    },
    [enable]
  );

  const resolve = useCallback(
    (name: T, identifier?: string) => {
      const entry = overrides[name];
      const byId = identifier ? entry?.byId?.[identifier] : undefined;
      const globalOverride = entry?.global;

      // Force-on only: any override.enabled === true wins
      if (byId?.enabled === true) {
        return {
          enabled: true,
          meta: {
            source: "override",
            overridden: true,
            reason: "identifier override enabled",
          } as ResolveMeta,
        };
      }
      if (globalOverride?.enabled === true) {
        return {
          enabled: true,
          meta: {
            source: "override",
            overridden: true,
            reason: "global override enabled",
          } as ResolveMeta,
        };
      }

      // Fallback to service evaluation
      const enabled = service.isEnabled(name, identifier);
      return {
        enabled,
        meta: { source: "service", overridden: false } as ResolveMeta,
      };
    },
    [overrides, service]
  );

  const value = useMemo(
    () =>
      ({
        service,
        overrides,
        setOverride,
        clearOverride,
        resolve,
      }) as unknown as FeatureFlagOverridesContextValue<string>,
    [service, overrides, setOverride, clearOverride, resolve]
  );

  return (
    <FeatureFlagOverridesContext.Provider value={value}>
      {children}
    </FeatureFlagOverridesContext.Provider>
  );
}

export function useFeatureFlags<T extends string>() {
  const ctx = useContext(FeatureFlagOverridesContext) as unknown as Nullable<
    FeatureFlagOverridesContextValue<T>
  >;
  if (!ctx) {
    throw new Error(
      "useFeatureFlags must be used within FeatureFlagOverridesProvider"
    );
  }
  return ctx;
}

export function useFeature<T extends string>(name: T, identifier?: string) {
  const { resolve } = useFeatureFlags<T>();
  return resolve(name, identifier);
}
