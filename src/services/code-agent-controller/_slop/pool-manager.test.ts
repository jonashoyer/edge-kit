import { describe, expect, it, vi } from "vitest";

import type { AgentBoxStore } from "./agent-box-store";
import { DefaultPoolManager } from "./pool-manager";
import type { VmManager } from "../vm-manager";
import type { AgentBox, PoolConfig } from "../types";

const createBox = (id: string, status: AgentBox["status"], lastUsed: string): AgentBox => {
  return {
    id,
    status,
    repoContext: { url: "repo", branch: "main" },
    network: { publicIp: "1.2.3.4", sshPort: 22 },
    meta: {
      createdAt: lastUsed,
      lastHeartbeat: lastUsed,
      lastUsed,
      isPoolInstance: true,
    },
  };
};

describe("DefaultPoolManager", () => {
  it("creates standby boxes when below minStandby", async () => {
    const store: AgentBoxStore = {
      getById: vi.fn(async () => null),
      findAvailable: vi.fn(async () => null),
      listByRepo: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      updateStatus: vi.fn(async () => undefined),
      lease: vi.fn(async () => false),
      release: vi.fn(async () => undefined),
    };

    const allocator = {
      createPoolBox: vi.fn(async () => createBox("pool-1", "creating", new Date().toISOString())),
    } as unknown as { createPoolBox: (request: unknown) => Promise<AgentBox> };

    const vmManager: VmManager = {
      create: vi.fn(async () => ({
        id: "new",
        network: { publicIp: "1.2.3.4", sshPort: 22 },
      })),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      getStatus: vi.fn(async () => "running"),
      tag: vi.fn(async () => undefined),
      getIp: vi.fn(async () => ({ publicIp: "1.2.3.4", sshPort: 22 })),
    };

    const manager = new DefaultPoolManager({ store, vmManager, allocator });
    const config: PoolConfig = {
      repoUrl: "repo",
      minStandby: 2,
      maxInstances: 4,
      baseBranch: "main",
    };

    await manager.ensureMinStandby(config);

    expect(allocator.createPoolBox).toHaveBeenCalledTimes(2);
  });

  it("stops oldest boxes above maxInstances", async () => {
    const now = Date.now();
    const boxes = [
      createBox("box-1", "ready", new Date(now - 5000).toISOString()),
      createBox("box-2", "ready", new Date(now - 4000).toISOString()),
      createBox("box-3", "busy", new Date(now - 3000).toISOString()),
    ];

    const store: AgentBoxStore = {
      getById: vi.fn(async () => null),
      findAvailable: vi.fn(async () => null),
      listByRepo: vi.fn(async () => boxes),
      save: vi.fn(async () => undefined),
      updateStatus: vi.fn(async () => undefined),
      lease: vi.fn(async () => false),
      release: vi.fn(async () => undefined),
    };

    const allocator = {
      createPoolBox: vi.fn(async () => createBox("pool-1", "creating", new Date().toISOString())),
    } as unknown as { createPoolBox: (request: unknown) => Promise<AgentBox> };

    const vmManager: VmManager = {
      create: vi.fn(async () => ({
        id: "new",
        network: { publicIp: "1.2.3.4", sshPort: 22 },
      })),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      getStatus: vi.fn(async () => "running"),
      tag: vi.fn(async () => undefined),
      getIp: vi.fn(async () => ({ publicIp: "1.2.3.4", sshPort: 22 })),
    };

    const manager = new DefaultPoolManager({ store, vmManager, allocator });
    const config: PoolConfig = {
      repoUrl: "repo",
      minStandby: 1,
      maxInstances: 1,
      baseBranch: "main",
    };

    await manager.trimAboveMax(config);

    expect(vmManager.stop).toHaveBeenCalledTimes(2);
    expect(store.updateStatus).toHaveBeenCalledWith("box-1", "stopped");
    expect(store.updateStatus).toHaveBeenCalledWith("box-2", "stopped");
  });
});
