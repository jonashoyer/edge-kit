import type { CommandResult, HostHealth } from "./types";

export interface ProvisionerStatus {
  power?: string;
  prov?: string;
  raw: Array<{ code?: string; displayStatus?: string }>;
}

export interface Provisioner {
  create(vmName: string): Promise<void>;
  status(vmName: string): Promise<ProvisionerStatus>;
  deallocated(vmName: string): Promise<void>;
  start(vmName: string): Promise<void>;
  ensureHostReady(vmName: string): Promise<void>;
  healthCheck(vmName: string): Promise<HostHealth>;
  runCommand(vmName: string, cmds: string[]): Promise<CommandResult>;
}
