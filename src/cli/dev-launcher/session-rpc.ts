import type {
  DevLauncherLogsReadParams,
  DevLauncherLogsReadResult,
  DevLauncherRpcRequest,
  DevLauncherRpcResponse,
  DevLauncherServiceActionParams,
  DevLauncherServicesApplySetParams,
  DevLauncherSessionGetResult,
} from './types';

export const DEV_LAUNCHER_RPC_VERSION = '2.0' as const;

export const DEV_LAUNCHER_RPC_METHODS = {
  logsRead: 'logs.read',
  serviceRestart: 'service.restart',
  serviceStart: 'service.start',
  serviceStop: 'service.stop',
  servicesApplySet: 'services.applySet',
  sessionGet: 'session.get',
  sessionStop: 'session.stop',
} as const;

export type DevLauncherRpcMethod =
  (typeof DEV_LAUNCHER_RPC_METHODS)[keyof typeof DEV_LAUNCHER_RPC_METHODS];

export type DevLauncherRpcMethodParams = {
  'logs.read': DevLauncherLogsReadParams;
  'service.restart': DevLauncherServiceActionParams;
  'service.start': DevLauncherServiceActionParams;
  'service.stop': DevLauncherServiceActionParams;
  'services.applySet': DevLauncherServicesApplySetParams;
  'session.get': undefined;
  'session.stop': undefined;
};

export type DevLauncherRpcMethodResult = {
  'logs.read': DevLauncherLogsReadResult;
  'service.restart': DevLauncherSessionGetResult;
  'service.start': DevLauncherSessionGetResult;
  'service.stop': DevLauncherSessionGetResult;
  'services.applySet': DevLauncherSessionGetResult;
  'session.get': DevLauncherSessionGetResult;
  'session.stop': { stopped: true };
};

export const isDevLauncherRpcResponseFailure = <Result>(
  response: DevLauncherRpcResponse<Result>
): response is Extract<DevLauncherRpcResponse<Result>, { error: unknown }> => {
  return 'error' in response;
};

export const createDevLauncherRpcRequest = <
  Method extends DevLauncherRpcMethod,
>(
  id: string,
  method: Method,
  params: DevLauncherRpcMethodParams[Method]
): DevLauncherRpcRequest<DevLauncherRpcMethodParams[Method]> => {
  if (params === undefined) {
    return {
      id,
      jsonrpc: DEV_LAUNCHER_RPC_VERSION,
      method,
    };
  }

  return {
    id,
    jsonrpc: DEV_LAUNCHER_RPC_VERSION,
    method,
    params,
  };
};
