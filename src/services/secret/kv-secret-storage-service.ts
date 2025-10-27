import { stringToArrayBuffer } from "../../utils/buffer-utils";
import type { AbstractKeyValueService } from "../key-value/abstract-key-value";
import type { AbstractLogger } from "../logging/abstract-logger";
import type { AbstractSecretStorageService } from "./abstract-secret-storage-service";
import { type EncryptedData, EncryptionService } from "./encryption-service";

/**
 * Implements secure storage of secrets using the BasicEncryptionService and a key-value store
 */
export class KvSecretStorageService implements AbstractSecretStorageService {
  private readonly keyValueService: AbstractKeyValueService;
  private readonly encryptionService: EncryptionService;
  private readonly secretPrefix: string;
  private readonly logger?: AbstractLogger;

  /**
   * Creates a new KvSecretStorageService
   * @param keyValueService - The key-value service to use for storage
   * @param masterKey - The master encryption key (should be stored securely)
   * @param options - Additional configuration options
   */
  constructor(
    keyValueService: AbstractKeyValueService,
    masterKey: ArrayBuffer,
    options: {
      secretPrefix?: string;
      pbkdf2Iterations?: number;
      logger?: AbstractLogger;
    } = {}
  ) {
    this.keyValueService = keyValueService;
    this.encryptionService = new EncryptionService(masterKey, {
      pbkdf2Iterations: options.pbkdf2Iterations,
    });
    this.secretPrefix = options.secretPrefix || "secret:";
    this.logger = options.logger;
  }

  /**
   * Generate the storage key with namespace and prefix
   */
  private getStorageKey(key: string, namespace = "default"): string {
    return `${this.secretPrefix}${namespace}:${key}`;
  }

  /**
   * Store an encrypted secret
   */
  async storeSecret<T>(
    key: string,
    value: T,
    namespace = "default"
  ): Promise<void> {
    const storageKey = this.getStorageKey(key, namespace);
    // Convert value to string using JSON.stringify
    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value);
    const encryptedData = await this.encryptionService.encrypt(stringValue);
    await this.keyValueService.set(storageKey, encryptedData);
  }

  /**
   * Retrieve and decrypt a secret
   */
  async getSecret<T>(key: string, namespace = "default"): Promise<T | null> {
    const storageKey = this.getStorageKey(key, namespace);
    const encryptedData =
      await this.keyValueService.get<EncryptedData>(storageKey);

    if (!encryptedData) {
      return null;
    }

    try {
      const decryptedString =
        await this.encryptionService.decrypt(encryptedData);
      // Try to parse as JSON if it's a complex object, otherwise return as is
      try {
        return JSON.parse(decryptedString) as T;
      } catch {
        // If it's not valid JSON, return as is
        return decryptedString as unknown as T;
      }
    } catch (error) {
      this.logger?.error(
        `Failed to decrypt secret: ${key} in namespace: ${namespace}`,
        { error }
      );
      // Return null when decryption fails instead of throwing
      // This makes it easier for callers to handle failures
      return null;
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(key: string, namespace = "default"): Promise<void> {
    const storageKey = this.getStorageKey(key, namespace);
    await this.keyValueService.delete(storageKey);
  }

  /**
   * Check if a secret exists
   */
  async hasSecret(key: string, namespace = "default"): Promise<boolean> {
    const storageKey = this.getStorageKey(key, namespace);
    return await this.keyValueService.exists(storageKey);
  }

  /**
   * Rotate the encryption key for a specific secret
   */
  async rotateSecretKey(
    key: string,
    namespace = "default",
    newMasterKeyString?: string
  ): Promise<void> {
    try {
      // Get the secret with the current key
      const secret = await this.getSecret(key, namespace);

      if (secret === null) {
        throw new Error(
          `Secret '${key}' in namespace '${namespace}' not found for key rotation.`
        );
      }

      // If a new master key is provided, temporarily switch to it
      let originalMasterKey: ArrayBuffer | undefined;

      if (newMasterKeyString) {
        // Backup the current master key if we're temporarily using a new one
        const backupKey = await this.getSecret<string>(
          "master-key-backup",
          "system"
        );
        if (backupKey) {
          originalMasterKey = stringToArrayBuffer(backupKey);
        }

        // Convert string master key to ArrayBuffer
        const newMasterKey = stringToArrayBuffer(newMasterKeyString);
        this.encryptionService.setMasterKey(newMasterKey);
      }

      // Re-encrypt and store the secret with the current key settings
      // This will generate a new salt and nonce even if the master key hasn't changed
      await this.storeSecret(key, secret, namespace);

      // Restore the original key if we switched
      if (originalMasterKey) {
        this.encryptionService.setMasterKey(originalMasterKey);
      }
    } catch (error) {
      this.logger?.error(
        `Failed to rotate secret key for: ${key} in namespace: ${namespace}`,
        { error }
      );
      throw new Error(
        `Failed to rotate secret key: ${(error as Error).message}`
      );
    }
  }
}
