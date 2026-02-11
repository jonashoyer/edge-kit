import {
  ComputeManagementClient,
  type VirtualMachine,
} from '@azure/arm-compute';
import { DefaultAzureCredential } from '@azure/identity';
import type { Provisioner } from './provisioner';
import type { CommandResult, HostHealth } from './types';

export class AzureProvisioner implements Provisioner {
  private readonly subscriptionId: string;
  private readonly resourceGroupName: string;
  private readonly credential: DefaultAzureCredential;
  private readonly compute: ComputeManagementClient;
  private readonly vmConfig: VirtualMachine;

  constructor(
    subscriptionId: string,
    resourceGroupName: string,
    vmConfig: VirtualMachine
  ) {
    this.subscriptionId = subscriptionId;
    this.resourceGroupName = resourceGroupName;
    this.vmConfig = vmConfig;
    this.credential = new DefaultAzureCredential();
    this.compute = new ComputeManagementClient(
      this.credential,
      this.subscriptionId
    );
  }

  async create(vmName: string) {
    await this.compute.virtualMachines.beginCreateOrUpdateAndWait(
      this.resourceGroupName,
      vmName,
      {
        ...this.vmConfig,
      }
    );
  }

  async status(vmName: string) {
    const iv = await this.compute.virtualMachines.instanceView(
      this.resourceGroupName,
      vmName
    );
    const statuses = iv.statuses ?? [];
    const power = statuses.find((s) => s.code?.startsWith('PowerState/'))?.code; // e.g. PowerState/running [web:99]
    const prov = statuses.find((s) =>
      s.code?.startsWith('ProvisioningState/')
    )?.code; // e.g. ProvisioningState/succeeded [web:99]
    return {
      power,
      prov,
      raw: statuses.map((s) => ({
        code: s.code,
        displayStatus: s.displayStatus,
      })),
    };
  }

  async deallocated(vmName: string) {
    await this.compute.virtualMachines.beginDeallocateAndWait(
      this.resourceGroupName,
      vmName
    );
  }

  async start(vmName: string) {
    await this.compute.virtualMachines.beginStartAndWait(
      this.resourceGroupName,
      vmName
    );
  }

  async ensureHostReady(vmName: string): Promise<void> {
    const status = await this.status(vmName);
    if (status.power !== 'PowerState/running') {
      await this.start(vmName);
    }
    await this.runCommand(vmName, this.baseSetupScript());
  }

  async healthCheck(vmName: string): Promise<HostHealth> {
    const result = await this.runCommand(vmName, [
      'set -eu',
      'df -P / | tail -1',
      'cat /proc/loadavg',
    ]);
    const lines = result.stdout.split('\n').map((line) => line.trim());
    const diskLine = lines.find((line) => line.includes(' /')) ?? '';
    const diskMatch = diskLine.match(/\s(\d+)%\s+\/$/);
    const diskPercentUsed = diskMatch
      ? Number.parseInt(diskMatch[1] ?? '0', 10)
      : 0;
    const loadLine = lines.find((line) => line.includes(' ')) ?? '';
    const loadToken = loadLine.split(' ')[0];
    const load = loadToken ? Number.parseFloat(loadToken) : undefined;
    return {
      ok: diskPercentUsed < 80,
      diskPercentUsed,
      load,
      details: result.stdout,
    };
  }

  async runCommand(vmName: string, cmds: string[]): Promise<CommandResult> {
    const startedAt = new Date().toISOString();
    const result = await this.compute.virtualMachines.beginRunCommandAndWait(
      this.resourceGroupName,
      vmName,
      {
        commandId: 'RunShellScript',
        script: cmds, // each string is a line/command [web:31]
      }
    );
    const finishedAt = new Date().toISOString();
    const output = extractRunCommandOutput(result);
    return {
      stdout: output,
      stderr: '',
      exitCode: 0,
      startedAt,
      finishedAt,
    };
  }

  private baseSetupScript(): string[] {
    return [
      'set -eu',
      'export HOME="${HOME:-/root}"',
      'if command -v apt-get >/dev/null 2>&1; then',
      '  apt-get update -y',
      '  apt-get install -y git curl jq unzip',
      'elif command -v yum >/dev/null 2>&1; then',
      '  yum install -y git curl jq unzip',
      'fi',
      'export PATH="$HOME/.local/share/fnm:$PATH"',
      'if ! command -v fnm >/dev/null 2>&1; then',
      '  curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell',
      'fi',
      'if [ -s "$HOME/.local/share/fnm/fnm" ]; then ln -sf "$HOME/.local/share/fnm/fnm" /usr/local/bin/fnm; fi',
    ];
  }
}

type RunCommandOutput = { value?: Array<{ message?: string }> };

function extractRunCommandOutput(result: RunCommandOutput): string {
  const messages = result.value ?? [];
  const lines: string[] = [];
  for (const entry of messages) {
    if (entry.message) {
      lines.push(entry.message);
    }
  }
  return lines.join('\n');
}
