# Feature: Signed Value Integrity Service

**Date:** 2025-10-27
**Status:** ✅ COMPLETE

## Summary

Implemented HMAC-SHA256 based integrity service to protect stored values against tampering. Core service handles any JSON-serializable value, KV wrapper provides transparent signing/verification with automatic namespace isolation.

## 1. Codebase-First Analysis

### Existing Code Search

- `signature-utils.ts`:
  - `createRequestSignature()`, `verifyRequestSignature()`
  - Time-based request signing with drift validation
  - Base64 encoding/decoding patterns
  - HMAC-based signature verification
- `crypto-utils.ts`:
  - `sha256()`, `sha256Base64()` - async hashing
  - `constantTimeEqual()` - timing-safe comparison
  - `generateRandomBuffer()` - secure randomness
  - `hashCode()`, `hashCodeB64()` - fast non-crypto hashing
- `buffer-utils.ts`:
  - `arrayBufferToBase64Url()`, `base64UrlToArrayBuffer()` - serialization
  - `stringToArrayBuffer()`, `arrayBufferToString()` - conversions
- `encryption-service.ts`:
  - `EncryptionService` with AES-256-GCM
  - `encryptStringified()`, `decryptStringified()` - serialized format
  - Master key management
  - Salt/nonce generation
- `kv-secret-storage-service.ts`:
  - KV-backed service pattern
  - Encryption integration model
  - Namespace prefixing
  - Error handling with logging
- `abstract-key-value.ts`:
  - Interface for KV operations
  - Generic `get<T>()`, `set<T>()` methods
- `custom-error.ts`:
  - `CustomError<T>` with typed error codes
- Error handling patterns:
  - Try-catch with logging
  - Null return vs exception throwing
  - Error code enums

### Reusable Scaffolding

- `sha256Base64()` - produce tamper-proof signatures
- `constantTimeEqual()` - secure verification without timing attacks
- `arrayBufferToBase64Url()` / `base64UrlToArrayBuffer()` - value + signature serialization
- `stringToArrayBuffer()` - value conversion
- `generateRandomBuffer()` - optional nonce/salt for signature variants
- `CustomError` pattern - integrity violation error codes
- `KvSecretStorageService` pattern - KV-backed service architecture with namespace support
- Logging integration pattern from `kv-secret-storage-service.ts`

### External Research (If Necessary)

- HMAC-based signatures vs hash-based: Use existing crypto patterns
- Serialization format: Base64URL already standardized in codebase
- Error handling: Established `CustomError` pattern sufficient

## 2. Specifications

### User Stories / Outcome-driven Specification

- Sign any value (automatically serialize internally)
- Store signed object in KV with transparent signing/verification
- Verify before using retrieved values
- Detect tampering/corruption
- Namespace isolation
- Rewrite (no rotation migration)

### Technical Approach

- **Algorithm**: HMAC-SHA256 (symmetric, sufficient for integrity, fast)
- **SignedValue Object**:
  ```typescript
  {
    algorithm: "HMAC-SHA256",
    value: T (raw, not stringified),
    signature: string (base64url)
  }
  ```
- **Sign Flow**: Convert value to JSON string, compute HMAC-SHA256, return SignedValue object
- **Verify Flow**: Reconstruct HMAC from value, constant-time compare, return boolean
- **KV Integration**: Wrap `AbstractKeyValueService`
  - `set(key, value, secret, ttl?)`: Auto-sign, store SignedValue
  - `get(key, secret)`: Verify SignedValue, return raw value or null
  - Namespace support
  - Logging on verification failures

## 3. Development Steps

1. ✅ Create `src/services/integrity/abstract-signed-value.ts`
   - Interface: `sign<T>(value: T, secret: string): Promise<SignedValue<T>>`
   - Interface: `verify<T>(signedValue: SignedValue<T>, secret: string): Promise<boolean>`
   - `SignedValue<T>` type definition

2. ✅ Create `src/services/integrity/signed-value-service.ts`
   - Implements abstract interface
   - Uses `sha256Base64()` for HMAC computation
   - Uses `constantTimeEqual()` for verification
   - JSON stringify internally for any value type
   - Error handling: `SignatureVerificationError` with code `INVALID_SIGNATURE`

3. ✅ Create `src/services/integrity/kv-signed-value-service.ts`
   - Wraps `AbstractKeyValueService`
   - Auto-sign on `set()`, auto-verify on `get()`
   - Namespace support (e.g., `integrity:namespace:key`)
   - Return raw value on `get()`, not SignedValue object
   - Logging on verification failures (use optional logger)
   - On verification failure: return null (graceful)

4. ✅ Export from `src/services/integrity/index.ts`

5. ✅ Add tests for:
   - Sign/verify round-trip with various types (string, number, object, array) - 6 tests
   - Tampering detection (modified signature/value) - 2 tests
   - Constant-time verification - covered in timing-safe comparison
   - Invalid SignedValue format handling - 3 tests
   - KV set/get with verification - 7 tests
   - KV verification failure handling - 4 tests
   - Namespace isolation - 4 tests
   - **Total: 33 tests, all passing ✅**

6. ✅ Create comprehensive documentation in `src/services/integrity/README.md`

---

## Rationale

- **HMAC-SHA256**: Symmetric, appropriate for single-source integrity verification
- **Object return**: Leverages KV's native object storage, avoids string serialization overhead
- **Transparent serialization**: Service handles JSON internally, caller works with raw values
- **KV wrapper pattern**: Matches `KvSecretStorageService`, provides seamless integration

## Implementation Files

```
src/services/integrity/
├── abstract-signed-value.ts (44 lines)
├── signed-value-service.ts (79 lines)
├── kv-signed-value-service.ts (120 lines)
├── signed-value-service.test.ts (197 lines)
├── kv-signed-value-service.test.ts (283 lines)
├── index.ts (3 lines)
└── README.md (comprehensive documentation)
```

## Test Results

```
✓ src/services/integrity/signed-value-service.test.ts (18 tests)
  ✓ sign (6 tests)
  ✓ verify (10 tests)
  ✓ round-trip (2 tests)

✓ src/services/integrity/kv-signed-value-service.test.ts (15 tests)
  ✓ set and get (7 tests)
  ✓ delete (2 tests)
  ✓ exists (3 tests)
  ✓ integration (3 tests)

Total: 33 tests, all passing
```

## Usage

### Direct Signing

```typescript
import { SignedValueService } from "@edge-kit/services/integrity";

const service = new SignedValueService();
const signed = await service.sign(["admin-1", "admin-2"], secret);
const isValid = await service.verify(signed, secret);
```

### KV Integration

```typescript
import { KvSignedValueService } from "@edge-kit/services/integrity";

const integrity = new KvSignedValueService(kvService);
await integrity.set("admin-ids", ["admin-1", "admin-2"], secret, "production");
const adminIds = await integrity.get("admin-ids", secret, "production");
```

## Security Notes

- **Secret**: Min 32 chars, cryptographically random, stored securely
- **Timing Attack Protection**: Uses constant-time comparison
- **Tampering Detection**: Any modification to value/signature detected
- **No Non-Repudiation**: Symmetric key means both parties have secret (not suitable for digital signatures)
