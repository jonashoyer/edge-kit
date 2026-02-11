import type { VmCreateRequest, VmInstance, VmManager, VmStatus } from "../vm-manager";
import type { AgentBoxNetwork } from "../types";
import { VmManagerError } from "../errors";

export interface AzureVmNetworkConfig {
  subnetId: string;
  securityGroupId: string;
}

export interface AzureVmImageConfig {
  imageId: string;
}

export interface AzureVmManagerConfig {
  subscriptionId: string;
  resourceGroup: string;
  location: string;
  vmSize: string;
  adminUsername: string;
  sshPublicKey: string;
  network: AzureVmNetworkConfig;
  image: AzureVmImageConfig;
  client: AzureVmClient;
}

export interface AzureVmClient {
  createVirtualMachine(
    request: AzureVmCreateRequest
  ): Promise<AzureVmInstance>;
  startVirtualMachine(id: string): Promise<void>;
  stopVirtualMachine(id: string): Promise<void>;
  deleteVirtualMachine(id: string): Promise<void>;
  getVirtualMachine(id: string): Promise<AzureVmInstance>;
  updateVirtualMachineTags(id: string, tags: Record<string, string>): Promise<void>;
}

export interface AzureVmCreateRequest {
  name: string;
  resourceGroup: string;
  location: string;
  vmSize: string;
  adminUsername: string;
  sshPublicKey: string;
  subnetId: string;
  securityGroupId: string;
  imageId: string;
  tags?: Record<string, string>;
}

export interface AzureVmInstance {
  id: string;
  publicIp: string;
  sshPort: number;
  tags?: Record<string, string>;
  status?: VmStatus;
}

/**
 * Azure-backed VM manager implemented over a thin client interface.
 */
export class AzureVmManager implements VmManager {
  private config: AzureVmManagerConfig;

  constructor(config: AzureVmManagerConfig) {
    this.config = config;
  }

  async create(request: VmCreateRequest): Promise<VmInstance> {
    try {
      const vmRequest: AzureVmCreateRequest = {
        name: `cac-${crypto.randomUUID()}`,
        resourceGroup: this.config.resourceGroup,
        location: this.config.location,
        vmSize: this.config.vmSize,
        adminUsername: this.config.adminUsername,
        sshPublicKey: this.config.sshPublicKey,
        subnetId: this.config.network.subnetId,
        securityGroupId: this.config.network.securityGroupId,
        imageId: this.config.image.imageId,
        tags: request.tags,
      };
      const instance = await this.config.client.createVirtualMachine(vmRequest);
      return {
        id: instance.id,
        network: { publicIp: instance.publicIp, sshPort: instance.sshPort },
        tags: instance.tags,
      };
    } catch (error) {
      throw toVmManagerError(error, "Failed to create VM");
    }
  }

  async start(id: string): Promise<void> {
    try {
      await this.config.client.startVirtualMachine(id);
    } catch (error) {
      throw toVmManagerError(error, "Failed to start VM");
    }
  }

  async stop(id: string): Promise<void> {
    try {
      await this.config.client.stopVirtualMachine(id);
    } catch (error) {
      throw toVmManagerError(error, "Failed to stop VM");
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.config.client.deleteVirtualMachine(id);
    } catch (error) {
      throw toVmManagerError(error, "Failed to delete VM");
    }
  }

  async getStatus(id: string): Promise<VmStatus> {
    try {
      const instance = await this.config.client.getVirtualMachine(id);
      return instance.status ?? "error";
    } catch (error) {
      throw toVmManagerError(error, "Failed to get VM status");
    }
  }

  async tag(id: string, tags: Record<string, string>): Promise<void> {
    try {
      await this.config.client.updateVirtualMachineTags(id, tags);
    } catch (error) {
      throw toVmManagerError(error, "Failed to tag VM");
    }
  }

  async getIp(id: string): Promise<AgentBoxNetwork> {
    try {
      const instance = await this.config.client.getVirtualMachine(id);
      return { publicIp: instance.publicIp, sshPort: instance.sshPort };
    } catch (error) {
      throw toVmManagerError(error, "Failed to read VM network info");
    }
  }
}

const toVmManagerError = (error: unknown, message: string): VmManagerError => {
  if (error instanceof Error) {
    return new VmManagerError(`${message}: ${error.message}`);
  }
  return new VmManagerError(message);
};
