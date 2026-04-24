import { spawn } from 'node:child_process';
import { Box, render, Text, useApp, useInput } from 'ink';
/* biome-ignore lint/correctness/noUnusedImports: React must stay in scope for this JSX runtime path. */
import React, { useEffect, useState } from 'react';
import type { DevActionOrchestrationResult } from './action-orchestrator';
import {
  executeDevActionWithSession,
  getDevActionUnavailableMessage,
} from './action-orchestrator';
import type {
  DevActionRunnerRuntime,
  ResolvedDevAction,
} from './action-runner';
import { listDevActions } from './action-runner';
import { openExternalUrl } from './open-url';
import type { DevLauncherProcessController } from './process-manager';
import { DevLauncherProcessManager } from './process-manager';
import {
  applySessionServiceSelection,
  getStartupOptions,
  requestSessionViewExit,
  resolveSessionStartupSelection,
} from './session-view-orchestrator';
import type {
  DevLauncherLogEntry,
  DevLauncherSupervisorSnapshot,
  LoadedDevLauncherManifest,
  ManagedDevServiceStatus,
} from './types';

const MIN_DASHBOARD_LOG_LINES = 18;
const MIN_FOCUSED_LOG_LINES = 28;
const LOG_SCROLL_STEP = 8;

interface OverlayState {
  cursor: number;
  kind: 'action-picker' | 'service-picker' | 'startup' | null;
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
  listActions: (
    manifest: LoadedDevLauncherManifest
  ) => Promise<ResolvedDevAction[]>;
  openExternalUrl: (url: string) => Promise<void>;
  runDevAction: (
    manifest: LoadedDevLauncherManifest,
    actionId: string,
    options?: {
      controller?: Pick<
        DevLauncherProcessController,
        'applyServiceSet' | 'getSnapshot' | 'stopAll'
      >;
      refreshActions?: () => Promise<void>;
    }
  ) => Promise<DevActionOrchestrationResult>;
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
}

interface DevLauncherDashboardAppProps {
  allowStartupSelection?: boolean;
  controller: DevLauncherProcessController;
  initialServiceIds?: string[];
  listActions?: (
    manifest: LoadedDevLauncherManifest
  ) => Promise<ResolvedDevAction[]>;
  manifest: LoadedDevLauncherManifest;
  openExternalUrl?: (url: string) => Promise<void>;
  onExitCode: (code: number) => void;
  onRequestExit?: (options: {
    controller: DevLauncherProcessController;
    hasFailure: boolean;
  }) => Promise<void>;
  runDevAction?: (
    manifest: LoadedDevLauncherManifest,
    actionId: string,
    options?: {
      controller?: Pick<
        DevLauncherProcessController,
        'applyServiceSet' | 'getSnapshot' | 'stopAll'
      >;
      refreshActions?: () => Promise<void>;
    }
  ) => Promise<DevActionOrchestrationResult>;
}

const createTuiActionRuntime = (): DevActionRunnerRuntime => ({
  captureInheritedStdio: true,
  cwd: process.cwd(),
  env: process.env,
  platform: process.platform,
  spawn: (command, args, options) => spawn(command, args, options),
  stderr: {
    write: (_value: string) => true,
  } as Pick<NodeJS.WriteStream, 'write'>,
  stdout: {
    write: (_value: string) => true,
  } as Pick<NodeJS.WriteStream, 'write'>,
});

const defaultRuntime: DevLauncherTuiSessionRuntime = {
  createController: (manifest) => new DevLauncherProcessManager(manifest),
  listActions: async (manifest) => await listDevActions(manifest, manifest),
  openExternalUrl: async (url) => openExternalUrl(url),
  runDevAction: async (manifest, actionId, options) => {
    return await executeDevActionWithSession(manifest, manifest, {
      actionId,
      controller: options?.controller,
      hooks: {
        refreshActions: options?.refreshActions,
      },
      runtime: createTuiActionRuntime(),
    });
  },
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

const getDashboardLogLines = (terminalRows: number | undefined): number => {
  return Math.max((terminalRows ?? 24) - 10, MIN_DASHBOARD_LOG_LINES);
};

const getFocusedLogLines = (terminalRows: number | undefined): number => {
  return Math.max((terminalRows ?? 24) - 6, MIN_FOCUSED_LOG_LINES);
};

const isEscapeKey = (input: string, key: { escape?: boolean }): boolean => {
  return key.escape === true || input === '\u001B';
};

const getFocusedHelpText = (openUrl?: string): string => {
  const controls = ['Esc dashboard', 'x actions'];

  if (openUrl) {
    controls.push('o open');
  }

  controls.push('r restart', 's start/stop', 'q quit');
  return controls.join(', ');
};

const getDashboardHelpText = (openUrl?: string): string => {
  const controls = ['Enter focus log', 'a adjust services', 'x actions'];

  if (openUrl) {
    controls.push('o open');
  }

  controls.push('r restart', 's start/stop', 'q quit');
  return controls.join(', ');
};

const getStartupHelpText = (): string => {
  return '↑/↓ move, Enter select, x actions, q quit';
};

const getActionHelpText = (): string => {
  return '↑/↓ move, Enter run, hotkey run, r refresh, Esc close';
};

const getActionSummaryText = (actions: ResolvedDevAction[]): string => {
  if (actions.length === 0) {
    return 'No actions configured.';
  }

  const availableCount = actions.filter((action) => action.available).length;
  const availableHotkeys = actions.filter((action) => {
    return action.available && action.hotkey;
  });
  const hotkeySuffix =
    availableHotkeys.length > 0
      ? ` Hotkeys: ${availableHotkeys
          .map((action) => `${action.hotkey} ${action.id}`)
          .join(', ')}.`
      : '';

  return `Actions: ${availableCount} available, ${actions.length - availableCount} unavailable.${hotkeySuffix}`;
};

const requestOpenServiceUrl = (options: {
  manifest: LoadedDevLauncherManifest;
  openExternalUrl: (url: string) => Promise<void>;
  runAction: (label: string, action: () => Promise<void>) => void;
  serviceId: string;
  setFlashMessage: (message: string) => void;
}): void => {
  const service = options.manifest.servicesById[options.serviceId];
  const openUrl = service?.openUrl;

  if (!openUrl) {
    options.setFlashMessage(
      service
        ? `No open URL configured for ${service.label}.`
        : 'No open URL configured for this service.'
    );
    return;
  }

  options.runAction(`Opening ${openUrl}...`, async () => {
    await options.openExternalUrl(openUrl);
  });
};

/**
 * Ink application for the generic dev launcher. The focused log mode renders
 * only the selected service log so terminal text selection stays isolated.
 */
/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Dashboard state, render branches, and action wiring stay together so the TUI behavior remains explicit. */
export function DevLauncherDashboardApp({
  allowStartupSelection = true,
  controller,
  initialServiceIds,
  listActions = async (loadedManifest) => {
    return await defaultRuntime.listActions(loadedManifest);
  },
  manifest,
  openExternalUrl: openExternalUrlProp = openExternalUrl,
  onExitCode,
  onRequestExit,
  runDevAction: runDevActionProp = async (loadedManifest, actionId) => {
    return await defaultRuntime.runDevAction(loadedManifest, actionId);
  },
}: DevLauncherDashboardAppProps) {
  const { exit } = useApp();
  const startupSelection = resolveSessionStartupSelection(
    manifest,
    initialServiceIds,
    {
      allowStartupSelection,
    }
  );
  const [recentSelections] = useState(startupSelection.recentSelections);
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
    kind: allowStartupSelection
      ? startupSelection.source === 'explicit'
        ? null
        : recentSelections.length > 0
          ? 'startup'
          : 'service-picker'
      : null,
    pendingServiceIds: [],
    returnToStartup: recentSelections.length > 0,
  });
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const [hasFailure, setHasFailure] = useState(false);
  const [didApplyInitialSelection, setDidApplyInitialSelection] = useState(
    startupSelection.source !== 'explicit'
  );
  const [resolvedActions, setResolvedActions] = useState<ResolvedDevAction[]>(
    []
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

    setDidApplyInitialSelection(true);
    applySessionServiceSelection(
      manifest,
      controller,
      initialServiceIds as string[]
    ).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      setFlashMessage(`Error: ${message}`);
    });
  }, [controller, didApplyInitialSelection, initialServiceIds, manifest]);

  const refreshActions = async (): Promise<void> => {
    setIsLoadingActions(true);
    try {
      const actions = await listActions(manifest);
      setResolvedActions(actions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFlashMessage(`Error: ${message}`);
    } finally {
      setIsLoadingActions(false);
    }
  };

  useEffect(() => {
    void refreshActions();
  }, [listActions, manifest]);

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

  const startupOptions = getStartupOptions(manifest, recentSelections);
  const dashboardRows: Array<'all-logs' | string> = [
    'all-logs',
    ...snapshot.managedServiceIds,
  ];
  const dashboardLogLines = getDashboardLogLines(process.stdout.rows);
  const selectedService =
    selectedRowId === 'all-logs' ? null : manifest.servicesById[selectedRowId];
  const dashboardViewerLogs = getViewerLogs(snapshot, manifest, selectedRowId);
  const focusedLogLines = getFocusedLogLines(process.stdout.rows);
  const focusedViewerLogs =
    viewMode.kind === 'focused-log'
      ? getViewerLogs(snapshot, manifest, viewMode.serviceId)
      : [];
  const focusedScrollOffset =
    viewMode.kind === 'focused-log'
      ? (focusedLogScrollOffsets[viewMode.serviceId] ?? 0)
      : 0;
  const focusedService =
    viewMode.kind === 'focused-log'
      ? manifest.servicesById[viewMode.serviceId]
      : null;
  const selectedAction = resolvedActions.at(overlay.cursor);
  const actionsByHotkey = new Map(
    resolvedActions.flatMap((action) => {
      return action.hotkey ? [[action.hotkey, action] as const] : [];
    })
  );

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
    runAction('Applying service selection...', async () => {
      const normalizedServiceIds = await applySessionServiceSelection(
        manifest,
        controller,
        serviceIds
      );

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
        pendingServiceIds: manifest.serviceIdsInOrder.filter(
          (candidateServiceId) =>
            nextPendingServiceIds.includes(candidateServiceId)
        ),
      };
    });
  };

  const requestQuit = (): void => {
    runAction('Exiting...', async () => {
      await requestSessionViewExit({
        controller,
        exitCode: hasFailure ? 1 : 0,
        onRequestExit: onRequestExit
          ? async (requestOptions) => {
              await onRequestExit({
                controller: requestOptions.controller,
                hasFailure,
              });
            }
          : undefined,
        shouldDelegateExit: Boolean(onRequestExit),
      });
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
      focusedLogLines
    );

    setFocusedLogScrollOffsets((current) => ({
      ...current,
      [viewMode.serviceId]: Math.max(
        0,
        Math.min((current[viewMode.serviceId] ?? 0) + delta, maxScrollOffset)
      ),
    }));
  };

  const openActionPicker = (): void => {
    setOverlay({
      cursor: 0,
      kind: 'action-picker',
      pendingServiceIds:
        overlay.kind === 'service-picker'
          ? overlay.pendingServiceIds
          : snapshot.managedServiceIds,
      returnToStartup: overlay.kind === 'startup',
    });
    void refreshActions();
  };

  const requestRunDevAction = (action: ResolvedDevAction): void => {
    if (!action.available) {
      setFlashMessage(getDevActionUnavailableMessage(action));
      return;
    }

    runAction(`Running ${action.label}...`, async () => {
      const result = await runDevActionProp(manifest, action.id, {
        controller,
        refreshActions,
      });

      if (result.unavailable) {
        setFlashMessage(result.unavailable.message);
        return;
      }

      const execution = result.execution;
      if (!execution) {
        setFlashMessage(`Action "${action.id}" did not produce a result.`);
        return;
      }

      setFlashMessage(
        execution.summary ?? `Completed action "${execution.action.label}".`
      );
    });
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keyboard routing stays centralized so mode-specific controls remain explicit.
  useInput((input, key) => {
    if ((input === 'c' && key.ctrl) || input === 'q') {
      requestQuit();
      return;
    }

    const actionHotkey =
      overlay.kind === 'service-picker' || input.length !== 1
        ? undefined
        : actionsByHotkey.get(input.toLowerCase());
    if (actionHotkey) {
      requestRunDevAction(actionHotkey);
      return;
    }

    if (overlay.kind === 'action-picker') {
      if (key.upArrow) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          cursor: wrapCursor(currentOverlay.cursor - 1, resolvedActions.length),
        }));
        return;
      }

      if (key.downArrow) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          cursor: wrapCursor(currentOverlay.cursor + 1, resolvedActions.length),
        }));
        return;
      }

      if (input === 'r') {
        void refreshActions();
        return;
      }

      if (key.return) {
        if (selectedAction) {
          requestRunDevAction(selectedAction);
        }
        return;
      }

      if (isEscapeKey(input, key)) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          kind: currentOverlay.returnToStartup ? 'startup' : null,
        }));
      }
      return;
    }

    if (overlay.kind === 'startup') {
      if (input === 'x') {
        openActionPicker();
        return;
      }

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
            manifest.serviceIdsInOrder.length
          ),
        }));
        return;
      }

      if (key.downArrow) {
        setOverlay((currentOverlay) => ({
          ...currentOverlay,
          cursor: wrapCursor(
            currentOverlay.cursor + 1,
            manifest.serviceIdsInOrder.length
          ),
        }));
        return;
      }

      if (input === ' ') {
        const selectedServiceId = manifest.serviceIdsInOrder.at(overlay.cursor);
        if (selectedServiceId) {
          togglePendingService(selectedServiceId);
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
      if (input === 'x') {
        openActionPicker();
        return;
      }

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

      if (input === 'o') {
        requestOpenServiceUrl({
          manifest,
          openExternalUrl: openExternalUrlProp,
          runAction,
          serviceId: viewMode.serviceId,
          setFlashMessage,
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

    if (input === 'x') {
      openActionPicker();
      return;
    }

    if (input === 'o' && selectedRowId !== 'all-logs') {
      requestOpenServiceUrl({
        manifest,
        openExternalUrl: openExternalUrlProp,
        runAction,
        serviceId: selectedRowId,
        setFlashMessage,
      });
      return;
    }

    if (input === 'k') {
      const maxScrollOffset = getMaxScrollOffset(
        dashboardViewerLogs,
        dashboardLogLines
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

  if (overlay.kind === 'action-picker') {
    return (
      <Box flexDirection='column' height='100%' width='100%'>
        <Text color='cyan'>Developer actions</Text>
        <Text dimColor>{getActionHelpText()}</Text>
        {isLoadingActions ? (
          <Text dimColor>Refreshing action availability...</Text>
        ) : null}
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          marginTop={1}
          paddingX={1}
        >
          {resolvedActions.length === 0 ? (
            <Text dimColor>No actions configured.</Text>
          ) : (
            resolvedActions.map((action, index) => {
              const statusLabel = action.available
                ? 'available'
                : 'unavailable';
              return (
                <Text
                  color={action.available ? 'green' : 'red'}
                  key={action.id}
                >
                  {index === overlay.cursor ? '› ' : '  '}
                  {action.label}
                  {action.hotkey ? ` (${action.hotkey})` : ''} [{statusLabel}]
                  {action.reason ? ` — ${action.reason}` : ''}
                </Text>
              );
            })
          )}
        </Box>
        <Box flexGrow={1} />
        <Text dimColor>{getActionSummaryText(resolvedActions)}</Text>
        {flashMessage ? <Text color='yellow'>{flashMessage}</Text> : null}
      </Box>
    );
  }

  if (viewMode.kind === 'focused-log') {
    const visibleLogs = getVisibleLogs(
      focusedViewerLogs,
      focusedScrollOffset,
      focusedLogLines
    );
    const service = manifest.servicesById[viewMode.serviceId];

    return (
      <Box flexDirection='column' height='100%' width='100%'>
        <Text color='cyan'>{service?.label ?? viewMode.serviceId} log</Text>
        <Text dimColor>{getFocusedHelpText(focusedService?.openUrl)}</Text>
        <Box flexDirection='column' flexGrow={1} marginTop={1}>
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
        {flashMessage ? null : (
          <Text dimColor>{getActionSummaryText(resolvedActions)}</Text>
        )}
      </Box>
    );
  }

  if (overlay.kind === 'startup') {
    return (
      <Box flexDirection='column' height='100%' width='100%'>
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
            </Text>
          ))}
        </Box>
        <Box flexGrow={1} />
        <Text dimColor>{getStartupHelpText()}</Text>
        {flashMessage ? (
          <Text color='yellow'>{flashMessage}</Text>
        ) : (
          <Text dimColor>{getActionSummaryText(resolvedActions)}</Text>
        )}
      </Box>
    );
  }

  if (overlay.kind === 'service-picker') {
    return (
      <Box flexDirection='column' height='100%' width='100%'>
        <Text color='cyan'>Select services</Text>
        <Text dimColor>Space toggle, Enter apply, Esc cancel</Text>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          marginTop={1}
          paddingX={1}
        >
          {manifest.serviceIdsInOrder.map((serviceId, index) => {
            const service = manifest.servicesById[serviceId];
            const isSelected = overlay.pendingServiceIds.includes(serviceId);
            return (
              <Text key={serviceId}>
                {index === overlay.cursor ? '› ' : '  '}[
                {isSelected ? 'x' : ' '}] {service?.label ?? serviceId}
                {service?.description ? ` — ${service.description}` : ''}
              </Text>
            );
          })}
        </Box>
        <Box flexGrow={1} />
        {flashMessage ? (
          <Text color='yellow'>{flashMessage}</Text>
        ) : (
          <Text dimColor>{getActionSummaryText(resolvedActions)}</Text>
        )}
      </Box>
    );
  }

  const visibleDashboardLogs = getVisibleLogs(
    dashboardViewerLogs,
    dashboardLogScrollOffset,
    dashboardLogLines
  );

  return (
    <Box flexDirection='column' height='100%' width='100%'>
      <Text color='cyan'>
        {snapshot.managedServiceIds.length === 0
          ? 'No services selected'
          : 'Dev dashboard'}
      </Text>
      <Text dimColor>{getDashboardHelpText(selectedService?.openUrl)}</Text>
      <Box flexGrow={1} marginTop={1}>
        <Box
          borderColor='cyan'
          borderStyle='round'
          flexDirection='column'
          paddingX={1}
          width={28}
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
          flexGrow={1}
          marginLeft={1}
          paddingX={1}
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
      {flashMessage ? null : (
        <Text dimColor>{getActionSummaryText(resolvedActions)}</Text>
      )}
    </Box>
  );
}

/**
 * Starts the Ink TUI session and resolves when the app exits.
 */
export const startDevLauncherTuiSession = async (
  manifest: LoadedDevLauncherManifest,
  runtime: DevLauncherTuiSessionRuntime = defaultRuntime,
  initialServiceIds?: string[],
  options?: {
    allowStartupSelection?: boolean;
    onRequestExit?: (options: {
      controller: DevLauncherProcessController;
      hasFailure: boolean;
    }) => Promise<void>;
  }
): Promise<number> => {
  return await new Promise<number>((resolve) => {
    const controller = runtime.createController(manifest);
    render(
      <DevLauncherDashboardApp
        allowStartupSelection={options?.allowStartupSelection}
        controller={controller}
        initialServiceIds={initialServiceIds}
        listActions={runtime.listActions}
        manifest={manifest}
        onExitCode={(exitCode) => {
          resolve(exitCode);
        }}
        onRequestExit={options?.onRequestExit}
        openExternalUrl={runtime.openExternalUrl}
        runDevAction={runtime.runDevAction}
      />,
      {
        exitOnCtrlC: false,
        stderr: runtime.stderr,
        stdin: runtime.stdin,
        stdout: runtime.stdout,
      }
    );
  });
};
