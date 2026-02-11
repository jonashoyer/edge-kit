import type { WorkspaceRecord, WorkspaceStatus } from "./types";

export interface WorkspaceStore {
  get(id: string): Promise<WorkspaceRecord | null>;
  save(record: WorkspaceRecord): Promise<void>;
  update(record: WorkspaceRecord): Promise<void>;
  updateStatus(id: string, status: WorkspaceStatus): Promise<void>;
  delete(id: string): Promise<void>;
}
