import type { AbstractLogger } from "../logging/abstract-logger";
import type { AgentBoxStore } from "./_slop/agent-box-store";
import type { VmManager } from "./vm-manager";
import type { AllocatorRequest, AgentBox, PoolConfig } from "./types";
import { AllocatorService } from "./allocator-service";

export interface PoolManagerConfig {
  store: AgentBoxStore;
  vmManager: VmManager;
  allocator: AllocatorService;
  logger?: AbstractLogger;
}

/**
 * Pool manager reconciles standby counts for configured repos.
 */
export class DefaultPoolManager {
  private store: AgentBoxStore;
  private vmManager: VmManager;
  private allocator: AllocatorService;
  private logger?: AbstractLogger;

  constructor(config: PoolManagerConfig) {
    this.store = config.store;
    this.vmManager = config.vmManager;
    this.allocator = config.allocator;
    this.logger = config.logger;
  }

  async reconcilePools(configs: PoolConfig[]): Promise<void> {
    for (const config of configs) {
      await this.ensureMinStandby(config);
      await this.trimAboveMax(config);
    }
  }

  async ensureMinStandby(config: PoolConfig): Promise<void> {
    const boxes = await this.store.listByRepo({
      repoUrl: config.repoUrl,
      branch: config.baseBranch,
    });
    const active = boxes.filter((box) => isPoolReady(box)).length;
    const pending = boxes.filter((box) => box.status === "creating").length;
    const needed = config.minStandby - active - pending;
    if (needed <= 0) {
      return;
    }

    const tasks: Promise<void>[] = [];
    for (let i = 0; i < needed; i++) {
      const request: AllocatorRequest = {
        repoUrl: config.repoUrl,
        branch: config.baseBranch,
        requestedBy: "pool-manager",
        preferWarm: false,
      };
      tasks.push(
        this.allocator
          .createPoolBox(request)
          .then(() => undefined)
          .catch((error) => {
            this.logger?.warn("Failed to create standby box", {
              error: error instanceof Error ? error.message : "unknown error",
              repoUrl: config.repoUrl,
            });
          })
      );
    }
    await Promise.all(tasks);
  }

  async trimAboveMax(config: PoolConfig): Promise<void> {
    const boxes = await this.store.listByRepo({
      repoUrl: config.repoUrl,
      branch: config.baseBranch,
    });
    if (boxes.length <= config.maxInstances) {
      return;
    }

    const stoppable = boxes.filter((box) => box.status !== "busy");
    const sorted = [...stoppable].sort((a, b) => {
      const aTime = Date.parse(a.meta.lastUsed ?? a.meta.createdAt);
      const bTime = Date.parse(b.meta.lastUsed ?? b.meta.createdAt);
      return aTime - bTime;
    });

    const excess = sorted.slice(
      0,
      Math.min(sorted.length, boxes.length - config.maxInstances)
    );
    const tasks: Promise<void>[] = [];
    for (const box of excess) {
      if (box.status === "busy") {
        continue;
      }
      tasks.push(
        this.vmManager
          .stop(box.id)
          .then(async () => {
            await this.store.updateStatus(box.id, "stopped");
          })
          .catch((error) => {
            this.logger?.warn("Failed to stop excess box", {
              error: error instanceof Error ? error.message : "unknown error",
              boxId: box.id,
            });
          })
      );
    }
    await Promise.all(tasks);
  }

  async hibernateIdle(configs: PoolConfig[], now = Date.now()): Promise<void> {
    for (const config of configs) {
      const idleTtlSeconds = config.idleTtlSeconds ?? 0;
      if (idleTtlSeconds <= 0) {
        continue;
      }
      const cutoff = now - idleTtlSeconds * 1000;
      const boxes = await this.store.listByRepo({
        repoUrl: config.repoUrl,
        branch: config.baseBranch,
      });
      const tasks: Promise<void>[] = [];
      for (const box of boxes) {
        const lastUsed = Date.parse(box.meta.lastUsed ?? box.meta.createdAt);
        if (Number.isNaN(lastUsed) || lastUsed > cutoff) {
          continue;
        }
        if (box.status !== "ready") {
          continue;
        }
        tasks.push(
          this.vmManager
            .stop(box.id)
            .then(async () => {
              await this.store.updateStatus(box.id, "stopped");
            })
            .catch((error) => {
              this.logger?.warn("Failed to hibernate idle box", {
                error: error instanceof Error ? error.message : "unknown error",
                boxId: box.id,
              });
            })
        );
      }
      await Promise.all(tasks);
    }
  }
}

const isPoolReady = (box: AgentBox): boolean => {
  return box.status === "ready" && box.meta.isPoolInstance;
};
