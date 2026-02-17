import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { AbstractStorage, type StorageOptions } from './abstract-storage';

interface LocalStorageOptions extends StorageOptions {
  basePath: string;
}

/**
 * Local filesystem implementation of AbstractStorage.
 * Stores objects as files in a local directory.
 * Useful for development and testing environments.
 */
export class LocalStorage extends AbstractStorage {
  private readonly basePath: string;

  constructor(options: LocalStorageOptions) {
    super(options);
    this.basePath = options.basePath;
  }

  /**
   * Returns an appropriate storage path based on the operating system
   * @param appName Name of your application
   * @param subfolder Optional subfolder within the storage directory
   * @param systemWide Whether to use system-wide storage (requires elevated permissions)
   * @returns A platform-appropriate storage path
   */
  static getStoragePath(
    appName: string,
    subfolder?: string,
    systemWide = false
  ): string {
    let basePath: string;

    if (systemWide) {
      // System-wide storage paths (may require elevated permissions)
      if (process.platform === 'win32') {
        basePath = path.join('C:\\ProgramData', appName, 'storage');
      } else if (process.platform === 'darwin') {
        basePath = path.join(
          '/Library/Application Support',
          appName,
          'storage'
        );
      } else {
        // Linux/Unix
        basePath = path.join('/var/lib', appName, 'storage');
      }
    } else if (process.platform === 'win32') {
      basePath = path.join(
        os.homedir(),
        'AppData',
        'Local',
        appName,
        'storage'
      );
    } else if (process.platform === 'darwin') {
      basePath = path.join(
        os.homedir(),
        'Library',
        'Application Support',
        appName,
        'storage'
      );
    } else {
      // Linux/Unix
      basePath = path.join(os.homedir(), '.local', 'share', appName, 'storage');
    }

    return subfolder ? path.join(basePath, subfolder) : basePath;
  }

  async write(key: string, data: Buffer): Promise<void> {
    const filePath = this.getFilePath(key);
    await this.ensureDirectoryExists(filePath);
    await fs.writeFile(filePath, data);
  }

  async read(key: string): Promise<Buffer> {
    const filePath = this.getFilePath(key);
    return await fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getFilePath(key);
    await fs.unlink(filePath);
  }

  async list(prefix?: string): Promise<string[]> {
    const searchPath = prefix
      ? path.join(this.basePath, prefix)
      : this.basePath;

    try {
      await fs.access(searchPath);
    } catch {
      return [];
    }

    const result: string[] = [];
    await this.listFilesRecursively(searchPath, result, this.basePath);
    return result;
  }

  createReadPresignedUrl(key: string) {
    // In local storage, we don't need presigned URLs, so we just return the local file path
    // You could implement a simple HTTP server to serve these files if needed
    return Promise.resolve({
      url: `file://${this.getFilePath(key)}`,
      expiresAt: Number.POSITIVE_INFINITY,
    });
  }

  createWritePresignedUrl(key: string) {
    return Promise.resolve({
      url: `file://${this.getFilePath(key)}`,
      method: 'POST' as const,
      expiresAt: Number.POSITIVE_INFINITY,
    });
  }

  async objectMetadata<TMeta extends never = never>(key: string) {
    const meta = await fs.stat(key);

    return {
      contentLength: meta.size,
      contentType: 'file/bin',
      etag: String(meta.ino), // TODO: Is this a etag?!
      lastModified: meta.mtime.getTime(),
      meta: {} as TMeta,
    };
  }

  private getFilePath(key: string): string {
    return path.join(this.basePath, key);
  }

  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    try {
      await fs.access(dirname);
    } catch {
      await fs.mkdir(dirname, { recursive: true });
    }
  }

  private async listFilesRecursively(
    dir: string,
    result: string[],
    basePath: string
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.listFilesRecursively(fullPath, result, basePath);
      } else {
        // Convert absolute path to relative path from basePath
        const relativePath = path.relative(basePath, fullPath);
        // Normalize path separators to forward slashes like S3
        result.push(relativePath.replace(/\\/g, '/'));
      }
    }
  }
}
