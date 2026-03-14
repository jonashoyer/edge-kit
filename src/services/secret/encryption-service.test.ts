import { describe, expect, it } from 'vitest';

import {
  DecryptionFailedError,
  EncryptionService,
  InvalidEncryptedDataError,
} from './encryption-service';

const MASTER_KEY = new TextEncoder().encode('edge-kit-master-key').buffer;
const OTHER_MASTER_KEY = new TextEncoder().encode('other-master-key').buffer;

const tamperString = (value: string) => {
  const lastChar = value.at(-1);
  const replacement = lastChar === 'A' ? 'B' : 'A';
  return `${value.slice(0, -1)}${replacement}`;
};

describe('EncryptionService', () => {
  it('round-trips encrypted strings', async () => {
    const service = new EncryptionService(MASTER_KEY);
    const encrypted = await service.encryptStringified('secret');
    const decrypted = await service.decryptStringified(encrypted);

    expect(decrypted).toBe('secret');
  });

  it('throws InvalidEncryptedDataError for invalid payloads', async () => {
    const service = new EncryptionService(MASTER_KEY);

    await expect(service.decryptStringified('invalid')).rejects.toBeInstanceOf(
      InvalidEncryptedDataError
    );
  });

  it('throws DecryptionFailedError for wrong keys', async () => {
    const service = new EncryptionService(MASTER_KEY);
    const otherService = new EncryptionService(OTHER_MASTER_KEY);
    const encrypted = await service.encryptStringified('secret');

    await expect(otherService.decryptStringified(encrypted)).rejects.toBeInstanceOf(
      DecryptionFailedError
    );
  });

  it('throws DecryptionFailedError for tampered payloads', async () => {
    const service = new EncryptionService(MASTER_KEY);
    const encrypted = await service.encryptStringified('secret');

    await expect(
      service.decryptStringified(tamperString(encrypted))
    ).rejects.toBeInstanceOf(DecryptionFailedError);
  });
});
