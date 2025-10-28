# Integrity Service

Provides HMAC-SHA256 based signing and verification to protect against tampering of stored values.

## Overview

The integrity service allows you to:
- **Sign** any value (string, object, array, etc.) with a secret
- **Verify** signatures to detect tampering or corruption
- **Transparently** integrate with key-value stores for automatic signing/verification

Use cases:
- Protect admin IDs and configuration in Redis/KV stores
- Ensure system-critical data hasn't been modified
- Detect database corruption or unauthorized changes

## Architecture

### `SignedValueService`

Core signing/verification implementation using HMAC-SHA256.

```typescript
import { SignedValueService } from "@edge-kit/services/integrity";

const service = new SignedValueService();
const secret = process.env.INTEGRITY_SECRET;

// Sign a value
const signedAdminIds = await service.sign(
  ["admin-1", "admin-2", "admin-3"],
  secret
);
// Returns: { algorithm: "HMAC-SHA256", value: [...], signature: "..." }

// Verify a signed value
const isValid = await service.verify(signedAdminIds, secret);
```

### `KvSignedValueService`

Wraps any key-value service (Redis, KV store, etc.) with transparent signing/verification.

```typescript
import { KvSignedValueService } from "@edge-kit/services/integrity";
import { DrizzleKeyValueService } from "@edge-kit/services/key-value";

const kvService = new DrizzleKeyValueService(db);
const integrityService = new KvSignedValueService(kvService);

// Automatically signs and stores
await integrityService.set(
  "admin-ids",
  ["admin-1", "admin-2"],
  secret,
  "production"
);

// Automatically verifies before returning
const adminIds = await integrityService.get<string[]>(
  "admin-ids",
  secret,
  "production"
);
// Returns: ["admin-1", "admin-2"] or null if verification fails
```

## API

### SignedValueService

#### `sign<T>(value: T, secret: string): Promise<SignedValue<T>>`

Signs a value with the given secret.

**Parameters:**
- `value` - Any JSON-serializable value
- `secret` - The signing secret

**Returns:** `SignedValue<T>` object with `algorithm`, `value`, and `signature`

**Example:**
```typescript
const signed = await service.sign({ id: "admin-1" }, secret);
```

#### `verify<T>(signedValue: SignedValue<T>, secret: string): Promise<boolean>`

Verifies that a signed value hasn't been tampered with.

**Parameters:**
- `signedValue` - The SignedValue object to verify
- `secret` - The signing secret

**Returns:** `true` if signature is valid, `false` otherwise

**Example:**
```typescript
const isValid = await service.verify(signed, secret);
```

### KvSignedValueService

#### `set<T>(key: string, value: T, secret: string, namespace?: string, ttlSeconds?: number): Promise<void>`

Signs and stores a value.

**Parameters:**
- `key` - Storage key
- `value` - Any JSON-serializable value
- `secret` - The signing secret
- `namespace` - Optional namespace for key isolation (default: "default")
- `ttlSeconds` - Optional time-to-live in seconds

#### `get<T>(key: string, secret: string, namespace?: string): Promise<T | null>`

Retrieves and verifies a signed value.

**Returns:** The original value if verification succeeds, `null` if not found or verification fails

#### `delete(key: string, namespace?: string): Promise<void>`

Deletes a signed value.

#### `exists(key: string, namespace?: string): Promise<boolean>`

Checks if a signed value exists.

## Security Considerations

### Algorithm Choice

**HMAC-SHA256** was chosen because:
- Symmetric (both signer and verifier have the secret)
- Appropriate for integrity verification (not non-repudiation)
- Fast and widely supported
- Sufficient for protecting against tampering

The secret should be:
- At least 32 characters
- Random and cryptographically secure
- Stored securely (e.g., environment variables, secret manager)
- Never hardcoded

### Constant-Time Comparison

Verification uses constant-time comparison (`constantTimeEqual`) to prevent timing attacks. This ensures the comparison time doesn't leak information about the signature.

### Tampering Detection

Any modification to:
- The value
- The signature
- The algorithm

...will cause verification to fail and return `null` (or `false` for direct verification).

## Usage Example: Admin List Protection

```typescript
import { KvSignedValueService } from "@edge-kit/services/integrity";
import { IORediKeyValue } from "@edge-kit/services/key-value";

// Initialize services
const redis = new IORedisKeyValue(redisClient);
const integrity = new KvSignedValueService(redis);
const secret = process.env.ADMIN_LIST_SECRET;

// Store admin IDs
await integrity.set("admin-ids", ["admin-1", "admin-2"], secret, "system");

// Retrieve and verify
const adminIds = await integrity.get<string[]>("admin-ids", secret, "system");

if (!adminIds) {
  throw new Error("Admin list corrupted or tampered with");
}

// Use adminIds safely
console.log("Authorized admins:", adminIds);
```

## Error Handling

### SignedValueService

- `verify()` returns `false` for any verification failure (invalid signature, wrong format, etc.)
- No exceptions thrown during verification

### KvSignedValueService

- `get()` returns `null` if the key doesn't exist or verification fails
- Failures are logged via optional logger
- No exceptions thrown during retrieval/verification

### SignatureVerificationError

Available for custom error handling if needed:

```typescript
import { SignatureVerificationError } from "@edge-kit/services/integrity";

// Used internally but available for extension
```

## Testing

Run tests with:

```bash
npm test -- src/services/integrity
```

Tests cover:
- Sign/verify with various types (strings, numbers, objects, arrays)
- Tampering detection
- Constant-time verification
- KV integration
- Namespace isolation
- Complex nested structures

## Implementation Details

### Value Serialization

Values are automatically converted to JSON strings internally for consistent hashing:

```typescript
const value = { id: 1, name: "Admin" };
// Internally: JSON.stringify(value) = '{"id":1,"name":"Admin"}'
```

### Signature Format

The signature is computed as:

```
HMAC-SHA256(value_json_string + ":" + secret)
```

Result is base64url-encoded for safe transmission/storage.

### SignedValue Object

The returned object structure is:

```typescript
interface SignedValue<T> {
  algorithm: string;     // "HMAC-SHA256"
  value: T;              // Original value (raw, not stringified)
  signature: string;     // Base64url-encoded HMAC
}
```

This allows KV stores to store the entire object natively without additional serialization.

## Performance

- **Signing**: O(n) where n is the size of the value (JSON serialization + hashing)
- **Verification**: O(n) where n is the size of the value (same operations)
- **Constant-time comparison**: O(64) for SHA256 signature (always fixed size)

Typical latency (milliseconds):
- Small values (< 1KB): < 1ms
- Medium values (1-10KB): 1-5ms
- Large values (> 10KB): 5-50ms

## Future Enhancements

Possible additions:
- Algorithm versioning/migration
- Batch signing/verification
- HMAC rotation strategies
- Asymmetric signatures (RSA/ECDSA) if non-repudiation needed
- Compression for large values

