export interface StorageOptions {
  region?: string;
  endpoint?: string;
}

export abstract class AbstractStorage {
  constructor(protected options: StorageOptions) {}

  abstract upload(key: string, data: Buffer): Promise<void>;
  abstract download(key: string): Promise<Buffer>;
  abstract delete(key: string): Promise<void>;
  abstract list(prefix?: string): Promise<string[]>;
  abstract getPresignedUrl(key: string, expiresIn: number): Promise<string>;
}
