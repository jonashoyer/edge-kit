# CodeAgentController (CAC)

Workspace manager that provisions isolated job folders on a single Azure VM using RunCommand. Repos define runtime requirements with `.agent-runrc.json` (Node + pnpm only).

## Config: `.agent-runrc.json`

```json
{
  "runtime": {
    "node": "18.16.0",
    "pnpm": "8.15.4"
  },
  "env": {
    "NODE_ENV": "test"
  },
  "setupCommands": [
    "pnpm install",
    "pnpm run build"
  ]
}
```

## Usage (Service)

```typescript
import { CodeAgentController } from "@edge-kit/services/code-agent-controller/code-agent-controller";
import { AzureProvisioner } from "@edge-kit/services/code-agent-controller/azure-provisioning";
import { KeyValueWorkspaceStore } from "@edge-kit/services/code-agent-controller/key-value-workspace-store";

const store = new KeyValueWorkspaceStore({ kv: yourKeyValueService });
const provisioner = new AzureProvisioner(subscriptionId, resourceGroupName, vmConfig);
const controller = new CodeAgentController({
  store,
  provisioner,
  hostId: "vm-name",
});

await controller.provisionWorkspace({
  jobId: "job-123",
  repoUrl: "https://github.com/org/repo.git",
  branch: "main",
  envPayload: { PORT: "auto" },
});

await controller.executeCommand({
  jobId: "job-123",
  command: "pnpm test",
});

await controller.teardownWorkspace("job-123");
```

## Notes

- The controller writes `.env` from the repo config and optional env payload.
- `.agent-runrc.json` is required (unless provided as an override payload).
- Workspaces live under `/workspaces/<jobId>` by default.


Azure use Standard_D8as_v5 and security type as standard for hibernation support