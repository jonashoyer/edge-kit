import type { Nullable } from '../../utils/type-utils';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';
import type { AbstractLogger } from '../logging/abstract-logger';
import type { SignedValue } from './abstract-signed-value';
import { SignedValueService } from './signed-value-service';

/**
 * KV-backed signed value service that transparently signs values on storage
 * and verifies them on retrieval
 */
export class KvSignedValueService {
  private readonly kvService: AbstractKeyValueService;
  private readonly signedValueService: SignedValueService;
  private readonly integrityPrefix: string;
  private readonly logger?: AbstractLogger;

  /**
   * Creates a new KvSignedValueService
   * @param kvService - The key-value service to use for storage
   * @param options - Additional configuration options
   */
  constructor(
    kvService: AbstractKeyValueService,
    options: {
      integrityPrefix?: string;
      logger?: AbstractLogger;
    } = {}
  ) {
    this.kvService = kvService;
    this.signedValueService = new SignedValueService();
    this.integrityPrefix = options.integrityPrefix || 'integrity:';
    this.logger = options.logger;
  }

  /**
   * Generate the storage key with namespace and prefix
   */
  private getStorageKey(key: string, namespace = 'default'): string {
    return `${this.integrityPrefix}${namespace}:${key}`;
  }

  /**
   * Store a value with automatic signing
   * @param key - The key to store under
   * @param value - The value to sign and store (any type)
   * @param secret - The secret used for signing
   * @param namespace - Optional namespace for organizing values
   * @param ttlSeconds - Optional time-to-live in seconds
   */
  async set<T>(
    key: string,
    value: T,
    secret: string,
    namespace = 'default',
    ttlSeconds?: number
  ): Promise<void> {
    const storageKey = this.getStorageKey(key, namespace);

    // Sign the value
    const signedValue = await this.signedValueService.sign(value, secret);

    // Store the signed value object in KV
    await this.kvService.set(storageKey, signedValue, ttlSeconds);
  }

  /**
   * Retrieve a value with automatic verification
   * @param key - The key to retrieve
   * @param secret - The secret used for verification
   * @param namespace - Optional namespace the value was stored under
   * @returns The original value if verification succeeds, null if not found or verification fails
   */
  async get<T>(
    key: string,
    secret: string,
    namespace = 'default'
  ): Promise<Nullable<T>> {
    const storageKey = this.getStorageKey(key, namespace);

    // Retrieve the signed value object
    const signedValue = await this.kvService.get<SignedValue<T>>(storageKey);

    if (!signedValue) {
      return null;
    }

    try {
      // Verify the signature
      const isValid = await this.signedValueService.verify(signedValue, secret);

      if (!isValid) {
        this.logger?.warn(
          `Signature verification failed for key: ${key} in namespace: ${namespace}`
        );
        return null;
      }

      // Return the original value
      return signedValue.value;
    } catch (error) {
      this.logger?.error(
        `Error verifying signed value for key: ${key} in namespace: ${namespace}`,
        { error }
      );
      return null;
    }
  }

  /**
   * Delete a signed value
   * @param key - The key to delete
   * @param namespace - Optional namespace the value was stored under
   */
  async delete(key: string, namespace = 'default'): Promise<void> {
    const storageKey = this.getStorageKey(key, namespace);
    await this.kvService.delete(storageKey);
  }

  /**
   * Check if a signed value exists
   * @param key - The key to check
   * @param namespace - Optional namespace to check in
   */
  async exists(key: string, namespace = 'default'): Promise<boolean> {
    const storageKey = this.getStorageKey(key, namespace);
    return await this.kvService.exists(storageKey);
  }
}
