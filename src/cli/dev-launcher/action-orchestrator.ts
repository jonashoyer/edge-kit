import type {
  DevActionRunnerRuntime,
  DevActionRunExecutionResult,
  ResolvedDevAction,
} from './action-runner';
import { listDevActions, runDevAction } from './action-runner';
import type { LoadedDevActionsConfig } from './actions-config';
import type { DevLauncherProcessController } from './process-manager';
import type { LoadedDevLauncherManifest } from './types';

export interface DevActionUnavailableResult {
  action: ResolvedDevAction;
  message: string;
}

export interface DevActionExecutionRequest {
  actionId: string;
  force?: boolean;
}

export interface DevActionOrchestrationResult {
  execution?: DevActionRunExecutionResult;
  unavailable?: DevActionUnavailableResult;
}

export interface DevActionSessionHooks {
  refreshActions?: () => Promise<void>;
}

export interface SessionAwareDevActionOptions extends DevActionExecutionRequest {
  controller?: Pick<
    DevLauncherProcessController,
    'applyServiceSet' | 'getSnapshot' | 'stopAll'
  >;
  hooks?: DevActionSessionHooks;
  runtime?: DevActionRunnerRuntime;
}

const formatUnavailableActionMessage = (action: ResolvedDevAction): string => {
  const reasonSuffix = action.reason ? ` ${action.reason}` : '';
  return `Action "${action.id}" is unavailable.${reasonSuffix}`.trimEnd();
};

const withManagedServicePause = async <TResult>(
  action: ResolvedDevAction,
  controller:
    | Pick<
        DevLauncherProcessController,
        'applyServiceSet' | 'getSnapshot' | 'stopAll'
      >
    | undefined,
  run: () => Promise<TResult>
): Promise<TResult> => {
  if (!controller || action.impactPolicy === 'parallel') {
    return await run();
  }

  const managedServiceIds = [...controller.getSnapshot().managedServiceIds];
  if (managedServiceIds.length === 0) {
    return await run();
  }

  await controller.stopAll();

  try {
    return await run();
  } finally {
    await controller.applyServiceSet(managedServiceIds);
  }
};

export const resolveDevActionExecutionRequest = async (
  manifest: LoadedDevLauncherManifest,
  actionsConfig: LoadedDevActionsConfig,
  request: DevActionExecutionRequest,
  runtime?: DevActionRunnerRuntime
): Promise<DevActionOrchestrationResult> => {
  const resolvedActions = await listDevActions(manifest, actionsConfig, runtime);
  const action = resolvedActions.find(
    (candidate) => candidate.id === request.actionId
  );

  if (!action) {
    throw new Error(`Unknown dev action "${request.actionId}".`);
  }

  if (!(action.available || request.force)) {
    return {
      unavailable: {
        action,
        message: formatUnavailableActionMessage(action),
      },
    };
  }

  const execution = await runDevAction(manifest, actionsConfig, request.actionId, {
    force: request.force,
    runtime,
  });

  return { execution };
};

export const executeDevActionWithSession = async (
  manifest: LoadedDevLauncherManifest,
  actionsConfig: LoadedDevActionsConfig,
  options: SessionAwareDevActionOptions
): Promise<DevActionOrchestrationResult> => {
  const resolvedActions = await listDevActions(
    manifest,
    actionsConfig,
    options.runtime
  );
  const action = resolvedActions.find(
    (candidate) => candidate.id === options.actionId
  );

  if (!action) {
    throw new Error(`Unknown dev action "${options.actionId}".`);
  }

  if (!(action.available || options.force)) {
    return {
      unavailable: {
        action,
        message: formatUnavailableActionMessage(action),
      },
    };
  }

  try {
    return await withManagedServicePause(action, options.controller, async () => {
      const execution = await runDevAction(manifest, actionsConfig, options.actionId, {
        force: options.force,
        runtime: options.runtime,
      });
      return { execution };
    });
  } finally {
    await options.hooks?.refreshActions?.();
  }
};

export const getDevActionUnavailableMessage = formatUnavailableActionMessage;
