import type { AbstractLogger } from "../logging/abstract-logger";
import type { AgentBoxStore } from "./_slop/agent-box-store";
import type { Provisioner } from "./provisioner";
import type { VmManager } from "./vm-manager";
import type {
  AgentBox,
  AgentBoxStatus,
  AllocatorRequest,
  AllocatorResponse,
  ProvisioningStepResult,
} from "./types";
import { ProvisioningError } from "./errors";

export interface AllocatorServiceConfig {
  store: AgentBoxStore;
  vmManager: VmManager;
  provisioner: Provisioner;
  logger?: AbstractLogger;
  defaultLeaseTtlSeconds?: number;
  asyncProvisioning?: boolean;
}

/**
 * Orchestrates allocation of agent boxes from a warm pool or cold provisioning.
 */
export class AllocatorService {
  private store: AgentBoxStore;
  private vmManager: VmManager;
  private provisioner: Provisioner;
  private logger?: AbstractLogger;
  private defaultLeaseTtlSeconds: number;
  private asyncProvisioning: boolean;

  constructor(config: AllocatorServiceConfig) {
    this.store = config.store;
    this.vmManager = config.vmManager;
    this.provisioner = config.provisioner;
    this.logger = config.logger;
    this.defaultLeaseTtlSeconds = config.defaultLeaseTtlSeconds ?? 3600;
    this.asyncProvisioning = config.asyncProvisioning ?? true;
  }

  /**
   * Request a box for the provided repo+branch. Returns immediately unless
   * asyncProvisioning is disabled.
   */
  async requestBox(request: AllocatorRequest): Promise<AllocatorResponse> {
    const leaseTtlSeconds = request.leaseTtlSeconds ?? this.defaultLeaseTtlSeconds;
    if (request.preferWarm !== false) {
      const warm = await this.store.findAvailable({
        repoUrl: request.repoUrl,
        branch: request.branch,
      });
      if (warm) {
        const leased = await this.store.lease(
          warm.id,
          request.requestedBy,
          leaseTtlSeconds
        );
        if (leased) {
          return {
            boxId: warm.id,
            status: "busy",
            network: warm.network,
          };
        }
      }
    }

    const created = await this.createBox(request, false, leaseTtlSeconds);
    if (this.asyncProvisioning) {
      void this.provisionColdBox(created, request).catch((error) => {
        this.logger?.error("Provisioning failed", {
          error: error instanceof Error ? error.message : "unknown error",
          boxId: created.id,
        });
      });
      return {
        boxId: created.id,
        status: created.status,
        network: created.network,
        message: "Provisioning in progress",
      };
    }

    const status = await this.provisionColdBox(created, request);
    return {
      boxId: created.id,
      status,
      network: created.network,
    };
  }

  /**
   * Create a new pool instance without starting provisioning.
   */
  async createPoolBox(
    request: AllocatorRequest,
    leaseTtlSeconds?: number
  ): Promise<AgentBox> {
    return await this.createBox(request, true, leaseTtlSeconds);
  }

  private async createBox(
    request: AllocatorRequest,
    isPoolInstance: boolean,
    leaseTtlSeconds?: number
  ): Promise<AgentBox> {
    const now = new Date().toISOString();
    const leaseExpiresAt =
      !isPoolInstance && leaseTtlSeconds
        ? new Date(Date.now() + leaseTtlSeconds * 1000).toISOString()
        : undefined;
    const instance = await this.vmManager.create({
      repoUrl: request.repoUrl,
      branch: request.branch,
      tags: {
        repo: request.repoUrl,
        branch: request.branch,
        pool_instance: String(isPoolInstance),
        status: "creating",
        last_used: now,
      },
    });

    const box: AgentBox = {
      id: instance.id,
      status: "creating",
      assignedTo: isPoolInstance ? undefined : request.requestedBy,
      leaseExpiresAt,
      repoContext: {
        url: request.repoUrl,
        branch: request.branch,
      },
      network: instance.network,
      meta: {
        createdAt: now,
        lastHeartbeat: now,
        lastUsed: now,
        isPoolInstance,
      },
    };
    await this.store.save(box);
    return box;
  }

  private async provisionColdBox(
    box: AgentBox,
    request: AllocatorRequest
  ): Promise<AgentBoxStatus> {
    try {
      const repoContext = {
        repoUrl: request.repoUrl,
        branch: request.branch,
      };
      const steps: ProvisioningStepResult[] = [];
      steps.push(await this.provisioner.prepareRepo(repoContext));
      steps.push(await this.provisioner.installDependencies(repoContext));
      steps.push(await this.provisioner.bootDevcontainer(repoContext));
      if (request.envPayload) {
        steps.push(
          await this.provisioner.injectEnv({ envPayload: request.envPayload })
        );
      }

      const failed = steps.find((step) => !step.ok);
      if (failed) {
        throw new ProvisioningError(failed.error ?? "Provisioning failed");
      }

      if (box.meta.isPoolInstance) {
        await this.store.updateStatus(box.id, "ready");
        await this.store.release(box.id);
        return "ready";
      }
      await this.store.updateStatus(box.id, "ready");
      return "ready";
    } catch (error) {
      await this.store.updateStatus(box.id, "error");
      await this.vmManager.delete(box.id);
      const message = error instanceof Error ? error.message : "Provisioning failed";
      if (this.asyncProvisioning) {
        this.logger?.error("Provisioning failed", {
          error: message,
          boxId: box.id,
        });
        return "error";
      }
      throw new ProvisioningError(message);
    }
  }
}
