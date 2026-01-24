/**
 * Abstract interface for a secure secret storage service
 */
/**
 * Abstract base class for secure secret storage services.
 * Defines the contract for storing, retrieving, deleting, and rotating encrypted secrets.
 * Supports namespacing for better organization.
 */
export abstract class AbstractSecretStorageService {
  /**
   * Store an encrypted secret
   * @param key - The key to store the secret under
   * @param value - The secret value to encrypt and store
   * @param namespace - Optional namespace for organizing secrets
   */
  abstract storeSecret<T>(key: string, value: T, namespace?: string): Promise<void>;

  /**
   * Retrieve and decrypt a secret
   * @param key - The key of the secret to retrieve
   * @param namespace - Optional namespace the secret was stored under
   * @returns The decrypted secret or null if not found
   */
  abstract getSecret<T>(key: string, namespace?: string): Promise<T | null>;

  /**
   * Delete a secret
   * @param key - The key of the secret to delete
   * @param namespace - Optional namespace the secret was stored under
   */
  abstract deleteSecret(key: string, namespace?: string): Promise<void>;

  /**
   * Check if a secret exists
   * @param key - The key to check
   * @param namespace - Optional namespace to check in
   */
  abstract hasSecret(key: string, namespace?: string): Promise<boolean>;

  /**
   * Rotate the encryption key used for a specific secret
   * This re-encrypts the secret with a new key while maintaining the original data
   * @param key - The key of the secret to rotate
   * @param namespace - Optional namespace the secret was stored under
   * @param newEncryptionKey - Optional new encryption key to use (if not provided, a new default one will be used)
   */
  abstract rotateSecretKey(key: string, namespace?: string, newEncryptionKey?: string): Promise<void>;
}
