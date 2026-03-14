# Feature: Secret Storage

Status: Active
Last Reviewed: 2026-03-14

## Current State

`src/services/secret/` provides low-level encryption helpers and KV-backed
secret storage. `EncryptionService` now exposes typed error classes for invalid
payloads and decryption failures while preserving the current payload format.

## Implementation Constraints

- Preserve the existing encrypted string format.
- Prefer typed errors over console output for runtime failures.
- Keep the service based on Web Crypto primitives and copy-paste ready.

## Public API / Contracts

- `EncryptionService`
- `EncryptedData`
- `InvalidEncryptedDataError`
- `DecryptionFailedError`
- `KvSecretStorageService`

## What NOT To Do

- Do not change the payload wire format in this phase.
- Do not add external KMS/provider coupling here.
