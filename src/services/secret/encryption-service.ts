import { z } from "zod";
import { arrayBufferToBase64Url, arrayBufferToString, base64UrlToArrayBuffer, stringToArrayBuffer } from "../../utils/buffer-utils";
import { generateRandomBuffer } from "../../utils/crypto-utils";

const encryptedDataSchema = z.object({
  data: z.instanceof(ArrayBuffer),
  nonce: z.instanceof(ArrayBuffer),
  salt: z.instanceof(ArrayBuffer),
  algorithm: z.object({
    name: z.string(),
    pbkdf2Iterations: z.number(),
  }),
});
export type EncryptedData = z.infer<typeof encryptedDataSchema>;

/**
 * Basic encryption service using AES-256-GCM
 */
export class EncryptionService {
  private masterKeyMaterial: ArrayBuffer;
  private pbkdf2Iterations: number;
  private nonceLength: number;
  private saltLength: number;

  /**
   * Creates a new BasicEncryptionService
   * @param masterKey - The master encryption key (should be stored securely)
   * @param options - Additional configuration options
   */
  constructor(
    masterKey: ArrayBuffer,
    options: {
      pbkdf2Iterations?: number;
      nonceLength?: number;
      saltLength?: number;
    } = {}
  ) {
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
  private async deriveKey(salt: ArrayBuffer, pbkdf2Iterations?: number): Promise<CryptoKey> {
    const masterCryptoKey = await this.getMasterKeyForPbkdf2();
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: pbkdf2Iterations ?? this.pbkdf2Iterations,
        hash: 'SHA-256',
      },
      masterCryptoKey,
      { name: 'AES-GCM', length: 256 },
      false, // Non-extractable for better security
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Set a new master key
   * @param masterKey - The new master key to use
   */
  setMasterKey(masterKey: ArrayBuffer): void {
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
        name: 'AES-GCM',
        iv: nonce, // The 'iv' parameter is actually the nonce in AES-GCM
        tagLength: 128, // Authentication tag length (128 bits)
      },
      derivedKey,
      dataToEncrypt
    );

    // Return encrypted data with all metadata needed for decryption
    return {
      data,
      nonce,
      salt,
      algorithm: {
        name: 'AES-GCM',
        pbkdf2Iterations: this.pbkdf2Iterations,
      },
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
          name: algorithm.name ?? 'AES-GCM',
          iv: nonce,
          tagLength: 128,
        },
        derivedKey,
        data
      );

      return arrayBufferToString(decryptedBuffer);
    } catch (error) {
      // If decryption fails, it could indicate tampering (authentication tag mismatch)
      // or data corruption, or the wrong key was used
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data. It may have been tampered with or the encryption key is incorrect.');
    }
  }


  async encryptStringified(value: string): Promise<string> {
    const encryptedData = await this.encrypt(value);
    return `#${encryptedData.algorithm.name}:${encryptedData.algorithm.pbkdf2Iterations}:${arrayBufferToBase64Url(encryptedData.data)}:${arrayBufferToBase64Url(encryptedData.nonce)}:${arrayBufferToBase64Url(encryptedData.salt)}`;
  }

  async decryptStringified(value: string): Promise<string> {
    const regex = /^\#(AES-\w{3}):(\d+):([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/;

    const match = value.match(regex);
    if (!match) {
      throw new Error('Invalid encrypted data');
    }

    const [algorithmName, pbkdf2Iterations, data, nonce, salt] = match.slice(1);
    const encryptedData = await this.decrypt({
      data: base64UrlToArrayBuffer(data),
      nonce: base64UrlToArrayBuffer(nonce),
      salt: base64UrlToArrayBuffer(salt),
      algorithm: {
        name: algorithmName,
        pbkdf2Iterations: parseInt(pbkdf2Iterations),
      },
    });
    return encryptedData;
  }
} 