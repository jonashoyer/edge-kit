export type WorkspaceStatus = "creating" | "ready" | "busy" | "error" | "deleted";

export type WorkspaceMode = "repo" | "empty";

export interface JobSpec {
  runtime: {
    node: string;
    pnpm?: string;
  };
  env?: Record<string, string>;
  setupCommands?: string[];
}

export interface WorkspaceRecord {
  id: string;
  repoUrl: string;
  branch: string;
  status: WorkspaceStatus;
  createdAt: string;
  lastUsedAt: string;
  hostId: string;
  path: string;
  envInjected?: boolean;
  mode: WorkspaceMode;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
}

export interface HostHealth {
  ok: boolean;
  diskPercentUsed: number;
  load?: number;
  details?: string;
}
