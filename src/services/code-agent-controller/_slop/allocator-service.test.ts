import { describe, expect, it, vi } from "vitest";

import type { AgentBoxStore } from "./agent-box-store";
import { AllocatorService } from "./allocator-service";
import type { Provisioner } from "../provisioner";
import type { VmManager } from "../vm-manager";
import type { AgentBox } from "../types";

const createBox = (overrides: Partial<AgentBox> = {}): AgentBox => {
  const now = new Date().toISOString();
  return {
    id: "box-1",
    status: "ready",
    repoContext: { url: "repo", branch: "main" },
    network: { publicIp: "1.2.3.4", sshPort: 22 },
    meta: { createdAt: now, lastHeartbeat: now, isPoolInstance: true },
    ...overrides,
  };
};

describe("AllocatorService", () => {
  it("leases warm box when available", async () => {
    const store: AgentBoxStore = {
      getById: vi.fn(async () => null),
      findAvailable: vi.fn(async () => createBox()),
      listByRepo: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      updateStatus: vi.fn(async () => undefined),
      lease: vi.fn(async () => true),
      release: vi.fn(async () => undefined),
    };
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
    const provisioner: Provisioner = {
      prepareRepo: vi.fn(async () => ({ step: "prepare", ok: true, durationMs: 1 })),
      installDependencies: vi.fn(async () => ({ step: "install", ok: true, durationMs: 1 })),
      bootDevcontainer: vi.fn(async () => ({ step: "devcontainer", ok: true, durationMs: 1 })),
      injectEnv: vi.fn(async () => ({ step: "env", ok: true, durationMs: 1 })),
    };

    const allocator = new AllocatorService({
      store,
      vmManager,
      provisioner,
      asyncProvisioning: true,
    });

    const response = await allocator.requestBox({
      repoUrl: "repo",
      branch: "main",
      requestedBy: "agent",
    });

    expect(response.status).toBe("busy");
    expect(vmManager.create).not.toHaveBeenCalled();
  });

  it("creates and provisions cold box when no warm match", async () => {
    const store: AgentBoxStore = {
      getById: vi.fn(async () => null),
      findAvailable: vi.fn(async () => null),
      listByRepo: vi.fn(async () => []),
      save: vi.fn(async () => undefined),
      updateStatus: vi.fn(async () => undefined),
      lease: vi.fn(async () => false),
      release: vi.fn(async () => undefined),
    };
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
    const provisioner: Provisioner = {
      prepareRepo: vi.fn(async () => ({ step: "prepare", ok: true, durationMs: 1 })),
      installDependencies: vi.fn(async () => ({ step: "install", ok: true, durationMs: 1 })),
      bootDevcontainer: vi.fn(async () => ({ step: "devcontainer", ok: true, durationMs: 1 })),
      injectEnv: vi.fn(async () => ({ step: "env", ok: true, durationMs: 1 })),
    };

    const allocator = new AllocatorService({
      store,
      vmManager,
      provisioner,
      asyncProvisioning: false,
    });

    const response = await allocator.requestBox({
      repoUrl: "repo",
      branch: "main",
      requestedBy: "agent",
    });

    expect(response.status).toBe("ready");
    expect(vmManager.create).toHaveBeenCalledTimes(1);
  });
});
