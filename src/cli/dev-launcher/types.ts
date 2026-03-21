export type DevLauncherPackageManager = 'pnpm';

export interface DevLauncherUiConfig {
  logBufferLines?: number;
}

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

export interface DevLauncherPresetDefinition {
  description?: string;
  label: string;
  serviceIds: string[];
}

export interface DevLauncherManifest {
  packageManager: DevLauncherPackageManager;
  presetsById: Record<string, DevLauncherPresetDefinition>;
  servicesById: Record<string, DevLauncherServiceDefinition>;
  ui?: DevLauncherUiConfig;
  version: 1;
}

export interface LoadedDevLauncherManifest extends DevLauncherManifest {
  configPath: string;
  presetIdsInOrder: string[];
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

export interface DevLauncherSpawnSpec {
  args: string[];
  command: string;
  cwd: string;
  serviceId: string;
}
