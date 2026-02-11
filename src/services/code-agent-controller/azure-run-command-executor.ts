import { ComputeManagementClient } from "@azure/arm-compute";
import { DefaultAzureCredential } from "@azure/identity";
import type { CommandResult } from "./types";
import type { ICommandExecutor } from "./command-executor";

export interface AzureRunCommandExecutorConfig {
  subscriptionId: string;
  resourceGroupName: string;
}

export class AzureRunCommandExecutor implements ICommandExecutor {
  private readonly resourceGroupName: string;
  private readonly compute: ComputeManagementClient;

  constructor(config: AzureRunCommandExecutorConfig) {
    const credential = new DefaultAzureCredential();
    this.resourceGroupName = config.resourceGroupName;
    this.compute = new ComputeManagementClient(
      credential,
      config.subscriptionId
    );
  }

  async runScript(hostId: string, scriptLines: string[]): Promise<CommandResult> {
    const startedAt = new Date().toISOString();
    const result = await this.compute.virtualMachines.beginRunCommandAndWait(
      this.resourceGroupName,
      hostId,
      {
        commandId: "RunShellScript",
        script: scriptLines,
      }
    );
    const finishedAt = new Date().toISOString();
    return {
      stdout: extractRunCommandOutput(result),
      stderr: "",
      exitCode: 0,
      startedAt,
      finishedAt,
    };
  }

  async runCommand(hostId: string, command: string): Promise<CommandResult> {
    return await this.runScript(hostId, [command]);
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
  return lines.join("\n");
}
