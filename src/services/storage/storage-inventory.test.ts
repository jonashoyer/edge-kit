/** biome-ignore-all lint/suspicious/useAwait: in-memory doubles are synchronous */
import { describe, expect, it } from 'vitest';

import type {
  StorageBody,
  StorageExplorerCapability,
  StorageExplorerListPageOptions,
  StorageExplorerListPageResult,
} from './abstract-storage';
import { AbstractStorage } from './abstract-storage';
import {
  StorageExplorerUnavailableError,
  StorageInventoryService,
} from './storage-inventory';

class MemoryStorage extends AbstractStorage {
  readonly objects = new Map<string, StorageBody>();
  override readonly explorer?: StorageExplorerCapability;

  constructor(keys: string[] = [], withExplorer = false) {
    super({});

    for (const key of keys) {
      this.objects.set(key, key);
    }

    if (withExplorer) {
      this.explorer = {
        list: async (prefix?: string) => {
          return this.filterKeys(prefix);
        },
        listPage: async (
          prefix?: string,
          options?: StorageExplorerListPageOptions
        ): Promise<StorageExplorerListPageResult> => {
          const keysForPrefix = this.filterKeys(prefix);
          const startIndex = options?.continuationToken
            ? Number.parseInt(options.continuationToken, 10)
            : 0;
          const maxKeys = options?.maxKeys ?? keysForPrefix.length;
          const pageKeys = keysForPrefix.slice(
            startIndex,
            startIndex + maxKeys
          );
          const nextIndex = startIndex + pageKeys.length;

          return {
            keys: pageKeys,
            continuationToken:
              nextIndex < keysForPrefix.length ? String(nextIndex) : undefined,
          };
        },
      };
    }
  }

  override async write(key: string, data: StorageBody): Promise<void> {
    this.objects.set(key, data);
  }

  override async read(key: string): Promise<Buffer> {
    const stored = this.objects.get(key);

    if (!stored) {
      throw new Error(`Missing object: ${key}`);
    }

    return Buffer.from(stored as Uint8Array);
  }

  override async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  override async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  override async createReadPresignedUrl(
    key: string
  ): Promise<{ url: string; expiresAt: number }> {
    return {
      url: `https://example.test/read/${key}`,
      expiresAt: Date.now() + 60_000,
    };
  }

  override async createWritePresignedUrl(): Promise<{
    url: string;
    method: 'PUT';
    expiresAt: number;
  }> {
    return {
      url: 'https://example.test/write',
      method: 'PUT',
      expiresAt: Date.now() + 60_000,
    };
  }

  override async objectMetadata(): Promise<{
    contentLength: number;
    meta: never;
  }> {
    return {
      contentLength: 0,
      meta: undefined as never,
    };
  }

  private filterKeys(prefix?: string): string[] {
    const keys = [...this.objects.keys()].sort((left, right) =>
      left.localeCompare(right)
    );

    if (!prefix) {
      return keys;
    }

    return keys.filter((key) => key.startsWith(prefix));
  }
}

describe('StorageInventoryService', () => {
  it('throws when the storage provider does not expose explorer support', async () => {
    const inventory = new StorageInventoryService({
      storage: new MemoryStorage(),
    });

    await expect(inventory.listKeys()).rejects.toBeInstanceOf(
      StorageExplorerUnavailableError
    );
  });

  it('proxies listKeys() through storage.explorer.listPage()', async () => {
    const inventory = new StorageInventoryService({
      storage: new MemoryStorage(['docs/a.txt', 'docs/b.txt'], true),
    });

    await expect(inventory.listKeys('docs/', { maxKeys: 1 })).resolves.toEqual({
      keys: ['docs/a.txt'],
      continuationToken: '1',
    });
  });

  it('derives top-level directories and objects from flat keys', async () => {
    const inventory = new StorageInventoryService({
      storage: new MemoryStorage(
        ['docs/a.txt', 'docs/nested/b.txt', 'images/logo.png', 'root.txt'],
        true
      ),
    });

    await expect(inventory.listDirectory()).resolves.toEqual({
      prefix: '',
      directories: ['docs', 'images'],
      objects: [{ key: 'root.txt', name: 'root.txt' }],
    });
  });

  it('returns only immediate children for nested prefixes', async () => {
    const inventory = new StorageInventoryService({
      storage: new MemoryStorage(
        [
          'users/123/avatar.png',
          'users/123/docs/resume.pdf',
          'users/123/docs/cover.pdf',
          'users/123/docs/nested/ignored.txt',
        ],
        true
      ),
    });

    await expect(inventory.listDirectory('users/123')).resolves.toEqual({
      prefix: 'users/123/',
      directories: ['docs'],
      objects: [{ key: 'users/123/avatar.png', name: 'avatar.png' }],
    });
  });

  it('returns empty listings for missing prefixes', async () => {
    const inventory = new StorageInventoryService({
      storage: new MemoryStorage(['docs/a.txt'], true),
    });

    await expect(inventory.listDirectory('missing/')).resolves.toEqual({
      prefix: 'missing/',
      directories: [],
      objects: [],
    });
  });
});
