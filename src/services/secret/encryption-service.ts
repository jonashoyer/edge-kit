import {
  arrayBufferToBase64Url,
  arrayBufferToString,
  base64UrlToArrayBuffer,
  stringToArrayBuffer,
} from '../../utils/buffer-utils';
import { generateRandomBuffer } from '../../utils/crypto-utils';

const ENCRYPTED_STRING_REGEX =
  /^#(AES-\w{3}):(\d+):([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/;

export class InvalidEncryptedDataError extends Error {
  constructor(message = 'Invalid encrypted data') {
    super(message);
    this.name = 'InvalidEncryptedDataError';
  }
}

export class DecryptionFailedError extends Error {
  constructor(cause?: unknown) {
    super(
      'Failed to decrypt data. It may have been tampered with or the encryption key is incorrect.',
      { cause }
    );
    this.name = 'DecryptionFailedError';
  }
}

/**
 * Structure of encrypted data
 */
export interface EncryptedData {
  /** Encryption algorithm details */
  algorithm: {
    name: string;
    pbkdf2Iterations: number;
  };
  /** The encrypted data as a Base64 URL-safe string */
  data: ArrayBuffer;
  /** Nonce (Number used Once) used for encryption as a Base64 URL-safe string */
  nonce: ArrayBuffer;
  /** Salt used for key derivation as a Base64 URL-safe string */
  salt: ArrayBuffer;
}

/**
 * Basic encryption service using AES-256-GCM
 */
/**
 * Low-level encryption service using Web Crypto API (AES-256-GCM).
 * Handles key derivation (PBKDF2), encryption, and decryption of raw data.
 * Used internally by KvSecretStorageService.
 */
export class EncryptionService {
  private masterKeyMaterial: BufferSource;
  private readonly pbkdf2Iterations: number;
  private readonly nonceLength: number;
  private readonly saltLength: number;

  /**
   * Creates a new BasicEncryptionService
   * @param masterKey - The master encryption key (should be stored securely)
   * @param options - Additional configuration options
   */
  constructor(
    masterKey: BufferSource,
    options: {
      pbkdf2Iterations?: number;
      nonceLength?: number;
      saltLength?: number;
    } = {}
  ) {
    // Normalize to ArrayBuffer to satisfy subtle.importKey raw usage
    this.masterKeyMaterial = masterKey;
    this.pbkdf2Iterations = options.pbkdf2Iterations ?? 100_000;
    this.nonceLength = options.nonceLength ?? 12;
    this.saltLength = options.saltLength ?? 16;
  }

  /**
   * Imports the master key material for use with PBKDF2
   */
  private async getMasterKeyForPbkdf2(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
      'raw',
      this.masterKeyMaterial,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
  }

  /**
   * Derives an encryption key from the master key and salt using PBKDF2
   */
  private async deriveKey(
    salt: BufferSource,
    pbkdf2Iterations?: number
  ): Promise<CryptoKey> {
    const masterCryptoKey = await this.getMasterKeyForPbkdf2();
    return crypto.subtle.deriveKey(
      {
        hash: 'SHA-256',
        iterations: pbkdf2Iterations ?? this.pbkdf2Iterations,
        name: 'PBKDF2',
        salt,
      },
      masterCryptoKey,
      { length: 256, name: 'AES-GCM' },
      false, // Non-extractable for better security
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Set a new master key
   * @param masterKey - The new master key to use
   */
  setMasterKey(masterKey: BufferSource): void {
    this.masterKeyMaterial = masterKey;
  }

  /**
   * Encrypts data using AES-256-GCM
   * @param value - The data to encrypt
   * @returns An EncryptedData object containing the encrypted data and metadata
   */
  async encrypt(value: string): Promise<EncryptedData> {
    // Generate a random salt for key derivation
    const salt = generateRandomBuffer(this.saltLength);

    // Derive encryption key from master key and salt
    const derivedKey = await this.deriveKey(salt);

    // Generate a random nonce for AES-GCM
    const nonce = generateRandomBuffer(this.nonceLength);

    // Convert data to ArrayBuffer
    const dataToEncrypt = stringToArrayBuffer(value);

    // Encrypt the data
    const data = await crypto.subtle.encrypt(
      {
        iv: nonce, // The 'iv' parameter is actually the nonce in AES-GCM
        name: 'AES-GCM',
        tagLength: 128, // Authentication tag length (128 bits)
      },
      derivedKey,
      dataToEncrypt
    );

    // Return encrypted data with all metadata needed for decryption
    return {
      algorithm: {
        name: 'AES-GCM',
        pbkdf2Iterations: this.pbkdf2Iterations,
      },
      data,
      nonce: nonce.buffer.slice(
        nonce.byteOffset,
        nonce.byteOffset + nonce.byteLength
      ),
      salt: salt.buffer.slice(
        salt.byteOffset,
        salt.byteOffset + salt.byteLength
      ),
    };
  }

  /**
   * Decrypts data using AES-256-GCM
   * @param encryptedPayload - The encrypted data and metadata
   * @returns The decrypted data
   */
  async decrypt(encryptedPayload: EncryptedData) {
    const { data, nonce, salt, algorithm } = encryptedPayload;

    // Derive the same key used for encryption
    const derivedKey = await this.deriveKey(salt, algorithm.pbkdf2Iterations);

    try {
      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          iv: nonce,
          // biome-ignore lint/suspicious/noUnnecessaryConditions: Stored payloads from older callers may omit the algorithm name.
          name: algorithm.name ?? 'AES-GCM',
          tagLength: 128,
        },
        derivedKey,
        data
      );

      return arrayBufferToString(decryptedBuffer);
    } catch (error) {
      // If decryption fails, it could indicate tampering (authentication tag mismatch)
      // or data corruption, or the wrong key was used
      // biome-ignore lint/style/useErrorCause: DecryptionFailedError forwards its argument to ErrorOptions.cause.
      throw new DecryptionFailedError(error);
    }
  }

  async encryptStringified(value: string): Promise<string> {
    const encryptedData = await this.encrypt(value);
    return `#${encryptedData.algorithm.name}:${encryptedData.algorithm.pbkdf2Iterations}:${arrayBufferToBase64Url(encryptedData.data)}:${arrayBufferToBase64Url(encryptedData.nonce)}:${arrayBufferToBase64Url(encryptedData.salt)}`;
  }

  async decryptStringified(value: string): Promise<string> {
    const match = ENCRYPTED_STRING_REGEX.exec(value);
    // biome-ignore lint/suspicious/noUnnecessaryConditions: RegExp.exec returns null for malformed external ciphertext.
    if (!match) {
      throw new InvalidEncryptedDataError();
    }

    const [algorithmName, pbkdf2Iterations, data, nonce, salt] = match.slice(
      1
    ) as [string, string, string, string, string];
    const encryptedData = await this.decrypt({
      algorithm: {
        name: algorithmName,
        pbkdf2Iterations: Number.parseInt(pbkdf2Iterations, 10),
      },
      data: base64UrlToArrayBuffer(data),
      nonce: base64UrlToArrayBuffer(nonce),
      salt: base64UrlToArrayBuffer(salt),
    });
    return encryptedData;
  }
}
