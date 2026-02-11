import type { AgentBoxNetwork } from "./types";

export interface VmInstance {
  id: string;
  network: AgentBoxNetwork;
  tags?: Record<string, string>;
}

export interface VmCreateRequest {
  repoUrl: string;
  branch: string;
  tags?: Record<string, string>;
}

export type VmStatus = "creating" | "running" | "stopped" | "error";

/**
 * Abstraction for VM lifecycle management.
 */
export interface VmManager {
  create(request: VmCreateRequest): Promise<VmInstance>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  getStatus(id: string): Promise<VmStatus>;
  tag(id: string, tags: Record<string, string>): Promise<void>;
  getIp(id: string): Promise<AgentBoxNetwork>;
}
