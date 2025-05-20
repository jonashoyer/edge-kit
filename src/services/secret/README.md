# Secret Storage Service

A secure service for storing and managing sensitive information using AES-256-GCM encryption, leveraging the Web Crypto API. This service is designed for use within the edge-kit environment.

## Features

- **Strong Encryption**: Utilizes AES-256-GCM for authenticated encryption, ensuring both confidentiality and integrity of your data.
- **Key Derivation**: Employs PBKDF2 with configurable iterations for robust key strengthening from a master key.
- **Namespaced Storage**: Allows organization of secrets into logical namespaces, preventing key collisions and improving management.
- **Key Rotation**: Supports rotation of the master encryption key for individual secrets, enhancing long-term security.
- **Edge Compatibility**: Built to work seamlessly within Next.js Edge runtime environments.
- **Web Crypto API**: Relies on the native Web Crypto API, avoiding dependencies on potentially deprecated or less secure libraries.
- **Flexible Data Handling**: Automatically serializes and deserializes complex JavaScript objects (using JSON) and primitives.
- **Type Safety**: Provides generic type support for `storeSecret` and `getSecret` for better development experience.

## Core Components

### 1. `EncryptionService`

(`src/services/secret/encryption-service.ts`)

This class is the foundation of the secret management system, providing low-level encryption and decryption functionalities.

- **Constructor**: `new EncryptionService(masterKey: ArrayBuffer, options?: { pbkdf2Iterations?: number; nonceLength?: number; saltLength?: number; })`
  - `masterKey`: An `ArrayBuffer` containing the master encryption key.
  - `options`:
    - `pbkdf2Iterations`: Number of iterations for PBKDF2 (default: 100,000).
    - `nonceLength`: Length of the nonce in bytes (default: 12).
    - `saltLength`: Length of the salt in bytes (default: 16).
- **Key Methods**:
  - `setMasterKey(masterKey: ArrayBuffer): void`: Updates the master key used by the service.
  - `encrypt(value: string): Promise<EncryptedData>`: Encrypts a string value.
  - `decrypt(encryptedPayload: EncryptedData): Promise<string>`: Decrypts an `EncryptedData` object back to a string.
  - `encryptStringified(value: string): Promise<string>`: Encrypts a string and returns a single string representation of the encrypted data (including metadata).
  - `decryptStringified(value: string): Promise<string>`: Decrypts a string previously encrypted with `encryptStringified`.

The `EncryptedData` interface is defined as:

```typescript
export interface EncryptedData {
  data: ArrayBuffer; // The encrypted content
  nonce: ArrayBuffer; // Nonce used for encryption
  salt: ArrayBuffer; // Salt used for key derivation
  algorithm: {
    name: string; // e.g., 'AES-GCM'
    pbkdf2Iterations: number;
  };
}
```

### 2. `AbstractSecretStorageService`

(`src/services/secret/abstract-secret-storage-service.ts`)

This abstract class defines the contract for any secret storage service implementation. It ensures a consistent API for storing, retrieving, deleting, and managing secrets.

- **Key Methods**:
  - `storeSecret<T>(key: string, value: T, namespace?: string): Promise<void>`
  - `getSecret<T>(key: string, namespace?: string): Promise<T | null>`
  - `deleteSecret(key: string, namespace?: string): Promise<void>`
  - `hasSecret(key: string, namespace?: string): Promise<boolean>`
  - `rotateSecretKey(key: string, namespace?: string, newMasterKeyString?: string): Promise<void>`
    - Note: The `newMasterKeyString` in `rotateSecretKey` allows providing a new master key (as a string) for re-encrypting a specific secret. If not provided, the secret is re-encrypted using the current master key (effectively refreshing its salt and nonce).

### 3. `KvSecretStorageService`

(`src/services/secret/kv-secret-storage-service.ts`)

This is a concrete implementation of `AbstractSecretStorageService` that uses an underlying `AbstractKeyValueService` (like `DrizzleKeyValueService`) for persistent storage and the `EncryptionService` for cryptographic operations.

- **Constructor**: `new KvSecretStorageService(keyValueService: AbstractKeyValueService, masterKey: ArrayBuffer, options?: { secretPrefix?: string; pbkdf2Iterations?: number; })`
  - `keyValueService`: An instance of a key-value storage service.
  - `masterKey`: The master encryption key as an `ArrayBuffer`.
  - `options`:
    - `secretPrefix`: A prefix for all keys stored in the key-value store (default: 'secret:').
    - `pbkdf2Iterations`: Passed to the underlying `EncryptionService`.

## Installation

The secret service is an integral part of edge-kit. Ensure your project is set up with edge-kit. You'll primarily interact with `KvSecretStorageService`.

## Basic Usage with `KvSecretStorageService`

```typescript
import { KvSecretStorageService } from '@/services/secret/kv-secret-storage-service';
import { DrizzleKeyValueService } from '@/services/key-value/drizzle-key-value'; // Example KV service
import { db } from '@/database/client'; // Your Drizzle DB instance
import { keyValueTable } from '@/database/schema'; // Your key-value schema
import { stringToArrayBuffer } from '@/utils/buffer-utils';

// 1. Initialize the Key-Value Service (example with Drizzle)
const keyValueService = DrizzleKeyValueService(db, keyValueTable);

// 2. Prepare the Master Key
// IMPORTANT: Store your master key securely, e.g., in environment variables.
// It MUST be a cryptographically strong random key.
const MASTER_KEY_STRING = process.env.ENCRYPTION_MASTER_KEY;
if (!MASTER_KEY_STRING) {
  throw new Error('ENCRYPTION_MASTER_KEY environment variable is not set.');
}
const masterKeyArrayBuffer = stringToArrayBuffer(MASTER_KEY_STRING);

// 3. Initialize the KvSecretStorageService
const secretService = new KvSecretStorageService(
  keyValueService,
  masterKeyArrayBuffer,
  {
    secretPrefix: 'myapp:secrets:', // Optional: custom prefix
    pbkdf2Iterations: 150000, // Optional: override PBKDF2 iterations
  }
);

// --- Store a secret (string) ---
await secretService.storeSecret(
  'apiKey',
  'my-super-secret-api-key',
  'external-services'
);

// --- Retrieve a secret (string) ---
const apiKey = await secretService.getSecret<string>(
  'apiKey',
  'external-services'
);
if (apiKey) {
  console.log('Retrieved API Key:', apiKey);
}

// --- Store an object ---
interface UserAuth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
await secretService.storeSecret<UserAuth>(
  'user-123-auth',
  { accessToken: 'abc', refreshToken: 'xyz', expiresAt: Date.now() + 3600000 },
  'user-credentials'
);

// --- Retrieve an object ---
const userAuth = await secretService.getSecret<UserAuth>(
  'user-123-auth',
  'user-credentials'
);
if (userAuth) {
  console.log('User Access Token:', userAuth.accessToken);
}

// --- Check if a secret exists ---
const exists = await secretService.hasSecret('apiKey', 'external-services');
console.log('API Key exists:', exists);

// --- Delete a secret ---
await secretService.deleteSecret('apiKey', 'external-services');
console.log('API Key deleted.');

// --- Rotate encryption key for a secret ---
// This example re-encrypts with the current master key (new salt/nonce)
await secretService.storeSecret('sensitive-data', 'old-value', 'app-config'); // Ensure it exists
await secretService.rotateSecretKey('sensitive-data', 'app-config');
console.log('Key rotated for sensitive-data (using current master key).');

// Rotate with a NEW master key (ensure NEW_MASTER_KEY_STRING is set securely)
// const NEW_MASTER_KEY_STRING = process.env.NEW_ENCRYPTION_MASTER_KEY;
// if (NEW_MASTER_KEY_STRING) {
//   await secretService.rotateSecretKey('sensitive-data', 'app-config', NEW_MASTER_KEY_STRING);
//   console.log('Key rotated for sensitive-data (using new master key).');
//   // IMPORTANT: After rotating to a new master key, the KvSecretStorageService
//   // instance's EncryptionService will be using that new key for *this specific rotation operation only*.
//   // The original masterKeyArrayBuffer used to initialize KvSecretStorageService
//   // is restored after the rotateSecretKey operation if a new key string was provided.
//   // If you intend to permanently switch to NEW_MASTER_KEY_STRING for all future operations,
//   // you should re-initialize KvSecretStorageService with the new key.
// }
```

## `IntegrationSecrets` Utility (Conceptual)

The `README.md` previously mentioned an `IntegrationSecrets` utility. While not directly found in the provided core service files (`encryption-service.ts`, `abstract-secret-storage-service.ts`, `kv-secret-storage-service.ts`), a similar pattern can be easily built on top of `KvSecretStorageService` for managing integration-specific credentials.

**Example Concept for `IntegrationSecrets`:**

You might create a wrapper class or a set of utility functions:

```typescript
// Conceptual IntegrationSecrets - build this yourself if needed
import { KvSecretStorageService } from '@/services/secret/kv-secret-storage-service';
// ... other imports

export class IntegrationSecretsManager {
  private secretService: KvSecretStorageService;
  private baseNamespace: string;

  constructor(
    secretService: KvSecretStorageService,
    baseNamespace: string = 'integrations'
  ) {
    this.secretService = secretService;
    this.baseNamespace = baseNamespace;
  }

  private getNamespace(integrationType: string): string {
    return `${this.baseNamespace}:${integrationType}`;
  }

  async storeCredentials<T>(
    serviceId: string,
    integrationType: string,
    credentials: T
  ): Promise<void> {
    await this.secretService.storeSecret<T>(
      serviceId,
      credentials,
      this.getNamespace(integrationType)
    );
  }

  async getCredentials<T>(
    serviceId: string,
    integrationType: string
  ): Promise<T | null> {
    return this.secretService.getSecret<T>(
      serviceId,
      this.getNamespace(integrationType)
    );
  }

  async deleteCredentials(
    serviceId: string,
    integrationType: string
  ): Promise<void> {
    await this.secretService.deleteSecret(
      serviceId,
      this.getNamespace(integrationType)
    );
  }

  // ... other methods like hasCredentials, rotateCredentialsKey etc.
}

// Usage:
// const integrationSecrets = new IntegrationSecretsManager(secretService, 'my-app-integrations');
// await integrationSecrets.storeCredentials('my-slack-workspace', 'SLACK', { token: 'xoxb-...' });
// const slackCreds = await integrationSecrets.getCredentials('my-slack-workspace', 'SLACK');
```

This approach uses distinct namespaces for different integration types (e.g., `integrations:SLACK`, `integrations:STRIPE`), and then uses `serviceId` (e.g., a workspace ID or a unique account identifier) as the key within that namespace.

## Security Considerations

1.  **Master Key Management**:

    - The security of all encrypted data hinges on the secrecy and strength of your `masterKey`.
    - **NEVER** hardcode the master key in your application code.
    - Store it in secure environment variables (e.g., `.env` files, platform-specific secret management like Vercel Environment Variables, AWS Secrets Manager, Google Secret Manager).
    - Ensure the master key is a cryptographically strong, randomly generated key of sufficient length (e.g., 32 bytes / 256 bits for AES-256).
    - Consider using a dedicated key management service (KMS) for handling the master key if your infrastructure supports it.

2.  **Key Rotation**:

    - Regularly rotate your master key according to your organization's security policies. The `rotateSecretKey` method facilitates this by allowing re-encryption of secrets with a new key.
    - When rotating to a new master key using `rotateSecretKey(key, namespace, newMasterKeyString)`, the `KvSecretStorageService` updates the specific secret. However, the service instance itself will revert to using its originally configured master key for subsequent operations unless you re-initialize it with the new master key. Plan your key rotation strategy accordingly.

3.  **Secure Environment**:

    - Ensure your application runtime environment (Node.js, Edge functions) is secure. Decrypted secrets will reside in memory during processing.
    - Protect against unauthorized access to your environment variables and deployment artifacts.

4.  **Nonce and Salt Management**:

    - The `EncryptionService` automatically generates a unique, random salt for PBKDF2 key derivation and a unique, random nonce (IV) for AES-GCM encryption for each secret stored. This is crucial for security and prevents attacks like nonce reuse. These are stored alongside the ciphertext.

5.  **Data Integrity**:

    - AES-GCM is an Authenticated Encryption with Associated Data (AEAD) mode. This means it provides both confidentiality (encryption) and integrity/authenticity (authentication tag). The `decrypt` method will automatically verify the authentication tag. If the ciphertext or associated data has been tampered with, decryption will fail, preventing the use of corrupted or malicious data.

6.  **Error Handling**:

    - The `getSecret` method in `KvSecretStorageService` is designed to return `null` if a secret is not found or if decryption fails (e.g., due to a wrong key or tampered data). This allows applications to handle such cases gracefully without crashing. Check for `null` and handle appropriately.
    - Log decryption failures securely if needed for auditing, but be cautious about logging sensitive details.

7.  **Input Validation**:
    - Always validate data after decryption and before use, especially if its structure is critical to your application's logic. While AES-GCM protects integrity, the decrypted data itself should still be treated as potentially untrusted input until validated.

## How It Works (Encryption & Decryption Flow with `KvSecretStorageService`)

1.  **Storing a Secret (`storeSecret`)**:
    a. The `KvSecretStorageService` generates a storage key (e.g., `secret:external-apis:api-key`).
    b. The input `value` (string, number, object, etc.) is serialized to a JSON string if it's not already a string.
    c. The `EncryptionService.encrypt(stringValue)` method is called:
    i. A cryptographically random `salt` (e.g., 16 bytes) is generated.
    ii. The master key (provided at `EncryptionService` initialization) and the `salt` are used with PBKDF2 (e.g., 100,000 iterations, SHA-256) to derive a unique 256-bit encryption key specifically for this secret instance.
    iii. A cryptographically random `nonce` (Initialization Vector - IV, e.g., 12 bytes) is generated.
    iv. The `stringValue` is converted to an `ArrayBuffer`.
    v. The data is encrypted using AES-256-GCM with the derived key and `nonce`. This produces the ciphertext and an authentication tag.
    vi. An `EncryptedData` object `{ data: ciphertextWithAuthTag, nonce, salt, algorithm: { name: 'AES-GCM', pbkdf2Iterations } }` is returned.
    d. This `EncryptedData` object is stored by the `AbstractKeyValueService` under the generated storage key.

2.  **Retrieving a Secret (`getSecret`)**:
    a. The `KvSecretStorageService` generates the storage key.
    b. The `AbstractKeyValueService` retrieves the stored `EncryptedData` object. If not found, `null` is returned.
    c. The `EncryptionService.decrypt(encryptedData)` method is called:
    i. The `salt` and `pbkdf2Iterations` from the stored `EncryptedData` object are used with the master key (from `EncryptionService` initialization) to re-derive the exact same 256-bit encryption key that was used for encryption.
    ii. The `nonce` from `EncryptedData` is also retrieved.
    iii. The `data` (ciphertextWithAuthTag) is decrypted using AES-256-GCM with the derived key and `nonce`. The authenticity tag is automatically verified during this process.
    iv. If decryption and authentication are successful, the plaintext `ArrayBuffer` is returned and converted to a string.
    v. If decryption or authentication fails (e.g., wrong master key, tampered data), an error is thrown internally.
    d. The `KvSecretStorageService` attempts to `JSON.parse()` the decrypted string. If successful, the parsed object is returned. If parsing fails (meaning it was likely a simple string originally), the decrypted string itself is returned.
    e. If any error occurs during decryption in `EncryptionService`, `KvSecretStorageService` catches it, logs an error, and returns `null`.

This robust process ensures that each secret is encrypted with a unique derived key (due to the unique salt) and nonce, providing strong cryptographic protection.
