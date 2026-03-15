import { Box, render, Text, useApp, useInput } from 'ink';
/* biome-ignore lint/correctness/noUnusedImports: React must stay in scope for this JSX runtime path. */
import React, { useEffect, useState } from 'react';
import { getPresetServiceIds, normalizeSelectedServiceIds } from './manifest';
import type { DevLauncherProcessController } from './process-manager';
import { DevLauncherProcessManager } from './process-manager';
import type {
  DevLauncherLogEntry,
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceStatus,
} from './types';

const DASHBOARD_LOG_LINES = 18;
const FOCUSED_LOG_LINES = 28;
const LOG_SCROLL_STEP = 8;

interface StartupOption {
  description?: string;
  kind: 'custom' | 'preset';
  label: string;
  serviceIds: string[];
}

interface OverlayState {
  cursor: number;
  kind: 'service-picker' | 'startup' | null;
  pendingServiceIds: string[];
  returnToStartup: boolean;
}

type ViewMode =
  | {
      kind: 'dashboard';
    }
  | {
      kind: 'focused-log';
      serviceId: string;
    };

export interface DevLauncherTuiSessionRuntime {
  createController: (
    manifest: LoadedDevLauncherManifest
  ) => DevLauncherProcessController;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

interface DevLauncherDashboardAppProps {
  controller: DevLauncherProcessController;
  initialServiceIds?: string[];
  manifest: LoadedDevLauncherManifest;
  onExitCode: (code: number) => void;
}

const defaultRuntime: DevLauncherTuiSessionRuntime = {
  createController: (manifest) => new DevLauncherProcessManager(manifest),
  stderr: process.stderr,
  stdin: process.stdin,
  stdout: process.stdout,
};

const STATUS_COLORS: Record<ManagedDevServiceStatus, string> = {
  failed: 'red',
  idle: 'gray',
  running: 'green',
  starting: 'yellow',
  stopped: 'gray',
  stopping: 'yellow',
};

const STATUS_SYMBOLS: Record<ManagedDevServiceStatus, string> = {
  failed: '!',
  idle: '·',
  running: '●',
  starting: '◐',
  stopped: '○',
  stopping: '◌',
};

const wrapCursor = (cursor: number, size: number): number => {
  if (size <= 0) {
    return 0;
  }

  return ((cursor % size) + size) % size;
};

const getStartupOptions = (
  manifest: LoadedDevLauncherManifest
): StartupOption[] => {
  return [
    ...manifest.presets.map((preset) => ({
      description: preset.description,
      kind: 'preset' as const,
      label: preset.label,
      serviceIds: getPresetServiceIds(manifest, preset.id),
    })),
    {
      description: 'Choose an ad hoc combination of declared services',
      kind: 'custom' as const,
      label: 'Custom selection',
      serviceIds: [] as string[],
    },
  ];
};

const getViewerLogs = (
  snapshot: DevLauncherSupervisorSnapshot,
  manifest: LoadedDevLauncherManifest,
  viewerId: 'all-logs' | string
): DevLauncherLogEntry[] => {
  if (viewerId === 'all-logs') {
    return snapshot.allLogs;
  }

  return snapshot.logsByServiceId[viewerId] ?? [];
};

const formatViewerLine = (
  manifest: LoadedDevLauncherManifest,
  entry: DevLauncherLogEntry,
  viewerId: 'all-logs' | string
): string => {
  if (viewerId === 'all-logs') {
    const label =
      manifest.servicesById[entry.serviceId]?.label ?? entry.serviceId;
    return `${label} | ${entry.line}`;
  }

  if (entry.stream === 'system') {
    return `[system] ${entry.line}`;
  }

  return entry.line;
};

const getVisibleLogs = (
  logs: DevLauncherLogEntry[],
  scrollOffset: number,
  maxLines: number
): DevLauncherLogEntry[] => {
  const clampedOffset = Math.max(scrollOffset, 0);
  const endIndex = Math.max(logs.length - clampedOffset, 0);
  const startIndex = Math.max(endIndex - maxLines, 0);

  return logs.slice(startIndex, endIndex);
};

const getMaxScrollOffset = (
  logs: DevLauncherLogEntry[],
  maxLines: number
): number => {
  return Math.max(logs.length - maxLines, 0);
};

const isEscapeKey = (input: string, key: { escape?: boolean }): boolean => {
  return key.escape === true || input === '\u001B';
};

/**
 * Ink application for the generic dev launcher. The focused log mode renders
 * only the selected service log so terminal text selection stays isolated.
 */
export const DevLauncherDashboardApp = ({
  controller,
  initialServiceIds,
  manifest,
  onExitCode,
}: DevLauncherDashboardAppProps) => {
  const { exit } = useApp();
  const [snapshot, setSnapshot] = useState<DevLauncherSupervisorSnapshot>(
    controller.getSnapshot()
  );
  const [selectedRowId, setSelectedRowId] = useState<'all-logs' | string>(
    'all-logs'
  );
  const [dashboardLogScrollOffset, setDashboardLogScrollOffset] = useState(0);
  const [focusedLogScrollOffsets, setFocusedLogScrollOffsets] = useState<
    Record<string, number>
  >({});
  const [viewMode, setViewMode] = useState<ViewMode>({
    kind: 'dashboard',
  });
  const [overlay, setOverlay] = useState<OverlayState>({
    cursor: 0,
    kind: initialServiceIds && initialServiceIds.length > 0 ? null : 'startup',
    pendingServiceIds: [],
    returnToStartup: true,
  });
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasFailure, setHasFailure] = useState(false);
  const [didApplyInitialSelection, setDidApplyInitialSelection] = useState(
    !(initialServiceIds && initialServiceIds.length > 0)
  );

  useEffect(() => {
    return controller.subscribe(() => {
      const nextSnapshot = controller.getSnapshot();
      setSnapshot(nextSnapshot);

      if (
        nextSnapshot.managedServiceIds.some((serviceId) => {
          return nextSnapshot.serviceStates[serviceId]?.status === 'failed';
        })
      ) {
        setHasFailure(true);
      }
    });
  }, [controller]);

  useEffect(() => {
    if (didApplyInitialSelection) {
      return;
    }

    const normalizedSelection = normalizeSelectedServiceIds(
      manifest,
      initialServiceIds as string[]
    );
    setDidApplyInitialSelection(true);
    controller.applyServiceSet(normalizedSelection).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setFlashMessage(`Error: ${message}`);
    });
  }, [controller, didApplyInitialSelection, initialServiceIds, manifest]);

  useEffect(() => {
    if (
      !snapshot.managedServiceIds.includes(selectedRowId) &&
      selectedRowId !== 'all-logs'
    ) {
      setSelectedRowId('all-logs');
      setDashboardLogScrollOffset(0);
    }

    if (
      viewMode.kind === 'focused-log' &&
      !snapshot.managedServiceIds.includes(viewMode.serviceId)
    ) {
      setViewMode({ kind: 'dashboard' });
    }
  }, [selectedRowId, snapshot.managedServiceIds, viewMode]);

  const startupOptions = getStartupOptions(manifest);
  const dashboardRows: Array<'all-logs' | string> = [
    'all-logs',
    ...snapshot.managedServiceIds,
  ];
  const dashboardViewerLogs = getViewerLogs(snapshot, manifest, selectedRowId);
  const focusedViewerLogs =
    viewMode.kind === 'focused-log'
      ? getViewerLogs(snapshot, manifest, viewMode.serviceId)
      : [];
  const focusedScrollOffset =
    viewMode.kind === 'focused-log'
      ? (focusedLogScrollOffsets[viewMode.serviceId] ?? 0)
      : 0;

  const runAction = (label: string, action: () => Promise<void>): void => {
    if (isBusy) {
      return;
    }

    setFlashMessage(label);
    setIsBusy(true);
    action()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setFlashMessage(`Error: ${message}`);
      })
      .finally(() => {
        setIsBusy(false);
      });
  };

  const applyManagedServiceIds = (serviceIds: Iterable<string>): void => {
    const normalizedServiceIds = normalizeSelectedServiceIds(
      manifest,
      serviceIds
    );

    runAction('Applying service selection...', async () => {
      await controller.applyServiceSet(normalizedServiceIds);

      setOverlay({
        cursor: 0,
        kind: null,
        pendingServiceIds: normalizedServiceIds,
        returnToStartup: false,
      });
      setViewMode({ kind: 'dashboard' });
      setSelectedRowId('all-logs');
      setDashboardLogScrollOffset(0);
    });
  };

  const togglePendingService = (serviceId: string): void => {
    setOverlay((currentOverlay) => {
      const isSelected = currentOverlay.pendingServiceIds.includes(serviceId);
      const nextPendingServiceIds = isSelected
        ? currentOverlay.pendingServiceIds.filter(
            (candidate) => candidate !== serviceId
          )
        : [...currentOverlay.pendingServiceIds, serviceId];

      return {
        ...currentOverlay,
        pendingServiceIds: normalizeSelectedServiceIds(
          manifest,
          nextPendingServiceIds
        ),
      };
    });
  };

  const requestQuit = (): void => {
    runAction('Stopping services and exiting...', async () => {
      await controller.stopAll();
      onExitCode(hasFailure ? 1 : 0);
      exit();
    });
  };

  const requestFocusedScroll = (delta: number): void => {
    if (viewMode.kind !== 'focused-log') {
      return;
    }

    const maxScrollOffset = getMaxScrollOffset(
      focusedViewerLogs,
      FOCUSED_LOG_LINES
    );

    setFocusedLogScrollOffsets((current) => ({
      ...current,
      [viewMode.serviceId]: Math.max(
        0,
        Math.min((current[viewMode.serviceId] ?? 0) + delta, maxScrollOffset)
      ),
    }));
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keyboard routing stays centralized so mode-specific controls remain explicit.
  useInput((input, key) => {
    if ((input === 'c' && key.ctrl) || input === 'q') {
      requestQuit();
      return;
    }

    if (overlay.kind === 'startup') {
      if (key.upArrow) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          cursor: wrapCursor(currentOverlay.cursor - 1, startupOptions.length),
        }));
        return;
      }

      if (key.downArrow) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          cursor: wrapCursor(currentOverlay.cursor + 1, startupOptions.length),
        }));
        return;
      }

      if (key.return) {
        const selectedOption = startupOptions[overlay.cursor];
        if (!selectedOption) {
          return;
        }

        if (selectedOption.kind === 'custom') {
          setOverlay({
            cursor: 0,
            kind: 'service-picker',
            pendingServiceIds: [],
            returnToStartup: true,
          });
          return;
        }

        applyManagedServiceIds(selectedOption.serviceIds);
      }
      return;
    }

    if (overlay.kind === 'service-picker') {
      if (key.upArrow) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          cursor: wrapCursor(
            currentOverlay.cursor - 1,
            manifest.services.length
          ),
        }));
        return;
      }

      if (key.downArrow) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          cursor: wrapCursor(
            currentOverlay.cursor + 1,
            manifest.services.length
          ),
        }));
        return;
      }

      if (input === ' ') {
        const selectedService = manifest.services.at(overlay.cursor);
        if (selectedService) {
          togglePendingService(selectedService.id);
        }
        return;
      }

      if (key.return) {
        if (overlay.pendingServiceIds.length > 0) {
          applyManagedServiceIds(overlay.pendingServiceIds);
        }
        return;
      }

      if (isEscapeKey(input, key)) {
        setOverlay({
          cursor: 0,
          kind: overlay.returnToStartup ? 'startup' : null,
          pendingServiceIds: snapshot.managedServiceIds,
          returnToStartup: false,
        });
      }
      return;
    }

    if (viewMode.kind === 'focused-log') {
      if (key.upArrow) {
        requestFocusedScroll(LOG_SCROLL_STEP);
        return;
      }

      if (key.downArrow) {
        requestFocusedScroll(-LOG_SCROLL_STEP);
        return;
      }

      if (input === 'r') {
        runAction('Restarting service...', async () => {
          await controller.restartService(viewMode.serviceId);
        });
        return;
      }

      if (input === 's') {
        runAction('Toggling service...', async () => {
          const status = snapshot.serviceStates[viewMode.serviceId]?.status;
          if (status === 'running' || status === 'starting') {
            await controller.stopService(viewMode.serviceId);
            return;
          }

          await controller.startService(viewMode.serviceId);
        });
        return;
      }

      if (isEscapeKey(input, key)) {
        setViewMode({ kind: 'dashboard' });
      }
      return;
    }

    if (key.upArrow) {
      const currentIndex = dashboardRows.indexOf(selectedRowId);
      const nextIndex = wrapCursor(currentIndex - 1, dashboardRows.length);
      setSelectedRowId(dashboardRows[nextIndex] ?? 'all-logs');
      setDashboardLogScrollOffset(0);
      return;
    }

    if (key.downArrow) {
      const currentIndex = dashboardRows.indexOf(selectedRowId);
      const nextIndex = wrapCursor(currentIndex + 1, dashboardRows.length);
      setSelectedRowId(dashboardRows[nextIndex] ?? 'all-logs');
      setDashboardLogScrollOffset(0);
      return;
    }

    if (key.return && selectedRowId !== 'all-logs') {
      setViewMode({
        kind: 'focused-log',
        serviceId: selectedRowId,
      });
      return;
    }

    if (input === 'r' && selectedRowId !== 'all-logs') {
      runAction('Restarting service...', async () => {
        await controller.restartService(selectedRowId);
      });
      return;
    }

    if (input === 's' && selectedRowId !== 'all-logs') {
      runAction('Toggling service...', async () => {
        const status = snapshot.serviceStates[selectedRowId]?.status;
        if (status === 'running' || status === 'starting') {
          await controller.stopService(selectedRowId);
          return;
        }

        await controller.startService(selectedRowId);
      });
      return;
    }

    if (input === 'a') {
      setOverlay({
        cursor: 0,
        kind: 'service-picker',
        pendingServiceIds: snapshot.managedServiceIds,
        returnToStartup: false,
      });
      return;
    }

    if (input === 'k') {
      const maxScrollOffset = getMaxScrollOffset(
        dashboardViewerLogs,
        DASHBOARD_LOG_LINES
      );
      setDashboardLogScrollOffset((currentOffset) => {
        return Math.min(currentOffset + LOG_SCROLL_STEP, maxScrollOffset);
      });
      return;
    }

    if (input === 'j') {
      setDashboardLogScrollOffset((currentOffset) => {
        return Math.max(currentOffset - LOG_SCROLL_STEP, 0);
      });
    }
  });

  if (viewMode.kind === 'focused-log') {
    const visibleLogs = getVisibleLogs(
      focusedViewerLogs,
      focusedScrollOffset,
      FOCUSED_LOG_LINES
    );
    const service = manifest.servicesById[viewMode.serviceId];

    return (
      <Box flexDirection='column'>
        <Text color='cyan'>{service?.label ?? viewMode.serviceId} log</Text>
        <Text dimColor>Esc dashboard, r restart, s start/stop, q quit</Text>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          marginTop={1}
          paddingX={1}
        >
          {visibleLogs.length === 0 ? (
            <Text dimColor>No log lines yet.</Text>
          ) : (
            visibleLogs.map((entry) => (
              <Text key={`${entry.sequence}`}>
                {formatViewerLine(manifest, entry, viewMode.serviceId)}
              </Text>
            ))
          )}
        </Box>
        {flashMessage ? (
          <Text color='yellow'>{flashMessage}</Text>
        ) : (
          <Text dimColor>
            Focused mode renders only this service log for clean text selection.
          </Text>
        )}
      </Box>
    );
  }

  if (overlay.kind === 'startup') {
    return (
      <Box flexDirection='column'>
        <Text color='cyan'>Start a dev session</Text>
        <Text dimColor>{manifest.configPath}</Text>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          marginTop={1}
          paddingX={1}
        >
          {startupOptions.map((option, index) => (
            <Text key={option.label}>
              {index === overlay.cursor ? '› ' : '  '}
              {option.label}
              {option.description ? ` — ${option.description}` : ''}
            </Text>
          ))}
        </Box>
        <Text dimColor>↑/↓ move, Enter select, q quit</Text>
      </Box>
    );
  }

  if (overlay.kind === 'service-picker') {
    return (
      <Box flexDirection='column'>
        <Text color='cyan'>Select services</Text>
        <Text dimColor>Space toggle, Enter apply, Esc cancel</Text>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          marginTop={1}
          paddingX={1}
        >
          {manifest.services.map((service, index) => {
            const isSelected = overlay.pendingServiceIds.includes(service.id);
            return (
              <Text key={service.id}>
                {index === overlay.cursor ? '› ' : '  '}[
                {isSelected ? 'x' : ' '}] {service.label}
                {service.description ? ` — ${service.description}` : ''}
              </Text>
            );
          })}
        </Box>
      </Box>
    );
  }

  const visibleDashboardLogs = getVisibleLogs(
    dashboardViewerLogs,
    dashboardLogScrollOffset,
    DASHBOARD_LOG_LINES
  );

  return (
    <Box flexDirection='column'>
      <Text color='cyan'>
        {snapshot.managedServiceIds.length === 0
          ? 'No services selected'
          : 'Dev dashboard'}
      </Text>
      <Text dimColor>
        Enter focus log, a adjust services, r restart, s start/stop, q quit
      </Text>
      <Box marginTop={1}>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          minWidth={28}
          paddingX={1}
        >
          {dashboardRows.map((rowId) => {
            if (rowId === 'all-logs') {
              return (
                <Text key='all-logs'>
                  {rowId === selectedRowId ? '› ' : '  '}
                  All logs
                </Text>
              );
            }

            const service = manifest.servicesById[rowId];
            const state = snapshot.serviceStates[rowId];
            const status = state?.status ?? 'idle';
            return (
              <Text color={STATUS_COLORS[status]} key={rowId}>
                {rowId === selectedRowId ? '› ' : '  '}
                {service?.label ?? rowId} {STATUS_SYMBOLS[status]} {status}
              </Text>
            );
          })}
        </Box>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          marginLeft={1}
          paddingX={1}
          width={80}
        >
          <Text color='cyan'>
            {selectedRowId === 'all-logs'
              ? 'All logs'
              : `${manifest.servicesById[selectedRowId]?.label ?? selectedRowId} logs`}
          </Text>
          {visibleDashboardLogs.length === 0 ? (
            <Text dimColor>No log lines yet.</Text>
          ) : (
            visibleDashboardLogs.map((entry) => (
              <Text key={`${entry.sequence}`}>
                {formatViewerLine(manifest, entry, selectedRowId)}
              </Text>
            ))
          )}
        </Box>
      </Box>
      {flashMessage ? <Text color='yellow'>{flashMessage}</Text> : null}
    </Box>
  );
};

/**
 * Starts the Ink TUI session and resolves when the app exits.
 */
export const startDevLauncherTuiSession = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherTuiSessionRuntime = defaultRuntime,
  initialServiceIds?: string[]
): Promise<number> => {
  return await new Promise<number>((resolve) => {
    const controller = runtime.createController(manifest);
    const instance = render(
      <DevLauncherDashboardApp
        controller={controller}
        initialServiceIds={initialServiceIds}
        manifest={manifest}
        onExitCode={(exitCode) => {
          resolve(exitCode);
        }}
      />,
      {
        exitOnCtrlC: false,
        stderr: runtime.stderr,
        stdin: runtime.stdin,
        stdout: runtime.stdout,
      }
    );

    const unsubscribe = controller.subscribe(() => {
      const snapshot = controller.getSnapshot();
      const shouldExit =
        snapshot.managedServiceIds.length === 0 && !initialServiceIds?.length;
      if (!shouldExit) {
        return;
      }

      unsubscribe();
      instance.unmount();
      resolve(0);
    });
  });
};
