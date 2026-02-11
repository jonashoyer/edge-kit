import type { AgentBox, AgentBoxStatus } from "../types";

export interface AgentBoxQuery {
  repoUrl: string;
  branch: string;
}

/**
 * Storage interface for AgentBox records.
 */
export interface AgentBoxStore {
  getById(id: string): Promise<AgentBox | null>;
  findAvailable(query: AgentBoxQuery): Promise<AgentBox | null>;
  listByRepo(query: AgentBoxQuery): Promise<AgentBox[]>;
  save(box: AgentBox): Promise<void>;
  updateStatus(id: string, status: AgentBoxStatus): Promise<void>;
  lease(
    id: string,
    assignedTo: string,
    ttlSeconds: number
  ): Promise<boolean>;
  release(id: string): Promise<void>;
}
