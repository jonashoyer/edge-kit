import process from 'node:process';
import { AzureProvisioner } from '../src/services/code-agent-controller/azure-provisioning';
import { CodeAgentController } from '../src/services/code-agent-controller/code-agent-controller';
import { KeyValueWorkspaceStore } from '../src/services/code-agent-controller/key-value-workspace-store';
import { buildExecuteScript } from '../src/services/code-agent-controller/script-builder';
import type { JobSpec } from '../src/services/code-agent-controller/types';
import { InMemoryKeyValueService } from '../src/services/key-value/in-memory-key-value';

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const subscriptionId = getEnv('AZ_SUBSCRIPTION_ID');
  const resourceGroupName = getEnv('AZ_RESOURCE_GROUP');
  const hostId = getEnv('AZ_VM_NAME');
  const repoUrl =
    process.env.CAC_REPO_URL ?? 'https://github.com/sindresorhus/slugify';
  const branch = process.env.CAC_REPO_BRANCH ?? 'main';

  const jobId = `demo-repo-${Date.now()}`;
  const emptyJobId = `demo-empty-${Date.now()}`;

  const spec: JobSpec = {
    runtime: {
      node: '20.11.1',
      pnpm: '8.15.4',
    },
    setupCommands: ['node -v', 'pnpm -v'],
  };

  const kv = new InMemoryKeyValueService();
  const store = new KeyValueWorkspaceStore({ kv });
  const provisioner = new AzureProvisioner(subscriptionId, resourceGroupName, {
    location: 'swedencentral',
  });
  const controller = new CodeAgentController({
    store,
    provisioner,
    hostId,
  });

  process.stdout.write(`Provisioning repo workspace ${jobId}\n`);
  await controller.provisionWorkspace({
    jobId,
    repoUrl,
    branch,
    configOverride: spec,
    envPayload: { DEMO_ENV: 'true' },
  });

  process.stdout.write('Verifying repo clone...\n');
  const verify = await provisioner.runCommand(
    hostId,
    buildExecuteScript({
      workspaceRoot: '/workspaces',
      jobId,
      command:
        "if [ -d .git ]; then echo 'repo: .git ok'; else echo 'repo: missing .git' >&2; exit 1; fi; " +
        "if [ -f pnpm-lock.yaml ] || [ -f package-lock.json ] || [ -f yarn.lock ] || [ -f package.json ]; " +
        "then echo 'repo: lockfile/package.json ok'; else echo 'repo: missing lockfile/package.json' >&2; exit 1; fi",
    })
  );
  process.stdout.write(`Repo verification output:\n${verify.stdout}\n`);

  process.stdout.write('Running workspace command...\n');
  const output = await provisioner.runCommand(
    hostId,
    buildExecuteScript({
      workspaceRoot: '/workspaces',
      jobId,
      command: 'node -v && pnpm -v',
    })
  );

  process.stdout.write(`Command output:\n${output.stdout}\n`);

  process.stdout.write('Checking Codex CLI...\n');
  const codexCheck = await provisioner.runCommand(
    hostId,
    buildExecuteScript({
      workspaceRoot: '/workspaces',
      jobId,
      command: 'npm i -g @openai/codex && codex --version',
    })
  );
  process.stdout.write(`Codex CLI output:\n${codexCheck.stdout}\n`);

  process.stdout.write(`Provisioning empty workspace ${emptyJobId}\n`);
  await controller.provisionWorkspace({
    jobId: emptyJobId,
    allowEmptyWorkspace: true,
  });

  const emptyOutput = await provisioner.runCommand(
    hostId,
    buildExecuteScript({
      workspaceRoot: '/workspaces',
      jobId: emptyJobId,
      command: 'node -v',
    })
  );
  process.stdout.write(`Empty workspace output:\n${emptyOutput.stdout}\n`);

  process.stdout.write('Teardown workspace...\n');
  await controller.teardownWorkspace(jobId);
  await controller.teardownWorkspace(emptyJobId);
}

await main();
