/**
 * Timestamp formatted as ISO 8601 string.
 */
export type IsoTimestamp = string;

/**
 * Status for an AgentBox lifecycle.
 */
export type AgentBoxStatus =
  | "creating"
  | "ready"
  | "busy"
  | "stopped"
  | "error";

/**
 * Network details for an AgentBox.
 */
export interface AgentBoxNetwork {
  publicIp: string;
  sshPort: number;
}

/**
 * Repo context assigned to an AgentBox.
 */
export interface AgentBoxRepoContext {
  url: string;
  branch: string;
  commitHash?: string;
}

/**
 * Metadata for an AgentBox.
 */
export interface AgentBoxMeta {
  createdAt: IsoTimestamp;
  lastHeartbeat: IsoTimestamp;
  lastUsed?: IsoTimestamp;
  isPoolInstance: boolean;
}

/**
 * Representation of an AgentBox instance managed by CAC.
 */
export interface AgentBox {
  id: string;
  status: AgentBoxStatus;
  assignedTo?: string;
  leaseExpiresAt?: IsoTimestamp;
  repoContext: AgentBoxRepoContext;
  network: AgentBoxNetwork;
  meta: AgentBoxMeta;
}

/**
 * Pool configuration for a repository.
 */
export interface PoolConfig {
  repoUrl: string;
  minStandby: number;
  maxInstances: number;
  baseBranch: string;
  idleTtlSeconds?: number;
}

/**
 * Request to allocate a box.
 */
export interface AllocatorRequest {
  repoUrl: string;
  branch: string;
  envPayload?: string;
  requestedBy: string;
  preferWarm?: boolean;
  leaseTtlSeconds?: number;
}

/**
 * Response from allocator.
 */
export interface AllocatorResponse {
  boxId: string;
  status: AgentBoxStatus;
  network: AgentBoxNetwork;
  message?: string;
}

/**
 * Result of a provisioning step.
 */
export interface ProvisioningStepResult {
  step: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Input to provisioner for repo operations.
 */
export interface RepoProvisioningContext {
  repoUrl: string;
  branch: string;
}

/**
 * Context used to inject environment payloads.
 */
export interface EnvInjectionContext {
  envPayload: string;
}
