import { CustomError } from '../../utils/custom-error';
import type {
  AbstractStorage,
  StorageExplorerListPageOptions,
  StorageExplorerListPageResult,
} from './abstract-storage';

export interface StorageDirectoryEntry {
  key: string;
  name: string;
}

export interface StorageDirectoryListing {
  prefix: string;
  directories: string[];
  objects: StorageDirectoryEntry[];
}

export interface StorageInventoryServiceOptions {
  storage: AbstractStorage;
}

export class StorageExplorerUnavailableError extends CustomError<'UNSUPPORTED'> {
  constructor() {
    super(
      'Storage explorer capability is unavailable for this storage provider',
      'UNSUPPORTED'
    );
  }
}

const normalizeDirectoryPrefix = (prefix: string | undefined): string => {
  if (!prefix) {
    return '';
  }

  const trimmed = prefix.trim();

  if (trimmed.length === 0) {
    return '';
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
};

export class StorageInventoryService {
  readonly storage: AbstractStorage;

  constructor(options: StorageInventoryServiceOptions) {
    this.storage = options.storage;
  }

  async listKeys(
    prefix?: string,
    options?: StorageExplorerListPageOptions
  ): Promise<StorageExplorerListPageResult> {
    return await this.requireExplorer().listPage(prefix, options);
  }

  async listDirectory(prefix?: string): Promise<StorageDirectoryListing> {
    const normalizedPrefix = normalizeDirectoryPrefix(prefix);
    const directories = new Set<string>();
    const objects: StorageDirectoryEntry[] = [];
    const keys = await this.requireExplorer().list(normalizedPrefix);

    for (const key of keys) {
      const relativeKey = normalizedPrefix
        ? key.slice(normalizedPrefix.length)
        : key;

      if (relativeKey.length === 0) {
        continue;
      }

      const slashIndex = relativeKey.indexOf('/');

      if (slashIndex === -1) {
        objects.push({
          key,
          name: relativeKey,
        });
        continue;
      }

      directories.add(relativeKey.slice(0, slashIndex));
    }

    objects.sort((left, right) => left.name.localeCompare(right.name));

    return {
      prefix: normalizedPrefix,
      directories: [...directories].sort((left, right) =>
        left.localeCompare(right)
      ),
      objects,
    };
  }

  private requireExplorer() {
    if (!this.storage.explorer) {
      throw new StorageExplorerUnavailableError();
    }

    return this.storage.explorer;
  }
}
