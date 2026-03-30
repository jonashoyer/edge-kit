import type { DevActionDefinition } from './actions';

export type DevLauncherPackageManager = 'pnpm';
export type DevLauncherCommandOutputFormat = 'text' | 'toon';

export interface DevLauncherUiConfig {
  logBufferLines?: number;
}

export type DevLauncherSessionMode = 'foreground' | 'headless';

export interface DevLauncherRootScriptTarget {
  kind: 'root-script';
  script: string;
}

export interface DevLauncherWorkspaceScriptTarget {
  kind: 'workspace-script';
  packageName?: string;
  packagePath?: string;
  script: string;
}

export interface DevLauncherCommandTarget {
  args?: string[];
  command: string;
  cwd?: string;
  kind: 'command';
}

export type DevLauncherTarget =
  | DevLauncherCommandTarget
  | DevLauncherRootScriptTarget
  | DevLauncherWorkspaceScriptTarget;

export interface DevLauncherServiceDefinition {
  description?: string;
  label: string;
  openUrl?: string;
  target: DevLauncherTarget;
}

export interface DevLauncherManifest {
  actionsById?: Record<string, DevActionDefinition>;
  packageManager: DevLauncherPackageManager;
  servicesById: Record<string, DevLauncherServiceDefinition>;
  ui?: DevLauncherUiConfig;
  version: 1;
}

export interface LoadedDevLauncherManifest extends DevLauncherManifest {
  actionIdsInOrder: string[];
  actionsById: Record<string, DevActionDefinition>;
  configPath: string;
  repoRoot: string;
  serviceIdsInOrder: string[];
}

export type ManagedDevServiceStatus =
  | 'failed'
  | 'idle'
  | 'running'
  | 'starting'
  | 'stopped'
  | 'stopping';

export type DevLauncherLogStream = 'stderr' | 'stdout' | 'system';

export type DevLauncherViewerId = 'all-logs' | string;

export interface ManagedDevServiceState {
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  lastStartedAt: number | null;
  lastStoppedAt: number | null;
  lastUpdatedAt: number;
  pid: number | null;
  runId: number;
  serviceId: string;
  status: ManagedDevServiceStatus;
}

export interface DevLauncherLogEntry {
  line: string;
  runId: number;
  sequence: number;
  serviceId: string;
  stream: DevLauncherLogStream;
  timestamp: number;
}

export interface DevLauncherSupervisorSnapshot {
  allLogs: DevLauncherLogEntry[];
  logsByServiceId: Record<string, DevLauncherLogEntry[]>;
  managedServiceIds: string[];
  serviceStates: Record<string, ManagedDevServiceState>;
}

export interface DevLauncherSessionMetadata {
  mode: DevLauncherSessionMode;
  pid: number;
  repoRoot: string;
  sessionId: string;
  socketPath: string;
  startedAt: number;
  version: 1;
}

export interface DevLauncherSessionSummary {
  metadata: DevLauncherSessionMetadata;
  snapshot: DevLauncherSupervisorSnapshot;
}

export interface DevLauncherLogsReadParams {
  afterSequence?: number;
  limit?: number;
  serviceId?: string;
}

export interface DevLauncherLogsReadResult {
  entries: DevLauncherLogEntry[];
  highestSequence: number;
}

export interface DevLauncherSessionGetResult {
  session: DevLauncherSessionSummary;
}

export interface DevLauncherServicesApplySetParams {
  serviceIds: string[];
}

export interface DevLauncherServiceActionParams {
  serviceId: string;
}

export interface DevLauncherRpcSuccess<Result> {
  id: string | number | null;
  jsonrpc: '2.0';
  result: Result;
}

export interface DevLauncherRpcErrorData {
  details?: Record<string, unknown>;
  errorCode?: string;
}

export interface DevLauncherRpcError {
  code: number;
  data?: DevLauncherRpcErrorData;
  message: string;
}

export interface DevLauncherRpcFailure {
  error: DevLauncherRpcError;
  id: string | number | null;
  jsonrpc: '2.0';
}

export type DevLauncherRpcResponse<Result> =
  | DevLauncherRpcFailure
  | DevLauncherRpcSuccess<Result>;

export interface DevLauncherRpcRequest<Params = undefined> {
  id: string | number | null;
  jsonrpc: '2.0';
  method: string;
  params?: Params;
}

export interface DevLauncherSpawnSpec {
  args: string[];
  command: string;
  cwd: string;
  serviceId: string;
}
