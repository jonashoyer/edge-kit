# CodeAgentController (CAC)

Copy-paste-first toolkit for managing ephemeral coding environments. This module provides allocator orchestration, warm pool management, VM lifecycle abstraction, and SSH provisioning with secure env injection.

## Install / Copy

Copy `src/services/agent-controller/` into your project along with dependencies:

- `src/services/key-value/*` (for Redis-backed store)
- `src/services/secret/encryption-service.ts`
- `src/utils/crypto-utils.ts`

## Basic Usage

```typescript
import { EncryptionService } from "../services/secret/encryption-service";
import { RedisAgentBoxStore } from "../services/agent-controller/redis-agent-box-store";
import { AllocatorService } from "../services/agent-controller/allocator-service";
import { DefaultPoolManager } from "../services/agent-controller/pool-manager";
import { EnvInjector } from "../services/agent-controller/env-injector";
import { SshProvisioner } from "../services/agent-controller/ssh-provisioner";

const store = new RedisAgentBoxStore({ kv: yourRedisKvService });
const envInjector = new EnvInjector({ encryption: new EncryptionService(masterKey) });

const provisioner = new SshProvisioner({
  executor: yourSshExecutor,
  envInjector,
  repoPath: "/home/agent/repo",
});

const allocator = new AllocatorService({
  store,
  vmManager: yourVmManager,
  provisioner,
});

const poolManager = new DefaultPoolManager({
  store,
  vmManager: yourVmManager,
  allocator,
});

// Request a box
const response = await allocator.requestBox({
  repoUrl: "https://github.com/org/repo.git",
  branch: "main",
  requestedBy: "ticket-123",
  envPayload: encryptedPayload,
});

// Run pool reconciliation (cron)
await poolManager.reconcilePools([
  { repoUrl: "https://github.com/org/repo.git", baseBranch: "main", minStandby: 2, maxInstances: 6 },
]);
```

## Notes

- Devcontainer build source is defined by the target repo. CAC runs `devcontainer up`, so the repo's `.devcontainer/devcontainer.json` decides whether to use a Dockerfile (`"dockerFile"`/`"build"`) or a prebuilt image (`"image"`).
- If the repo does not include a devcontainer config, provisioning will fail during `devcontainer up`.
- `.env` contents are decrypted in memory and written via SSH pipe. Avoid logging payloads.
- `AllocatorService` defaults to async provisioning (returns immediately).
- `DefaultPoolManager` is callable from a cron job or background worker.
