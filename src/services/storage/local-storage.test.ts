import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { LocalStorage } from './local-storage';

describe('LocalStorage explorer', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await rm(dir, { force: true, recursive: true });
      })
    );
  });

  it('lists paginated keys through explorer.listPage()', async () => {
    const basePath = await mkdtemp(path.join(os.tmpdir(), 'edge-kit-storage-'));
    tempDirs.push(basePath);
    const storage = new LocalStorage({ basePath });

    await storage.write('docs/a.txt', 'a');
    await storage.write('docs/b.txt', 'b');
    await storage.write('images/logo.png', 'logo');

    await expect(
      storage.explorer.listPage('docs/', {
        maxKeys: 1,
      })
    ).resolves.toEqual({
      continuationToken: '1',
      keys: ['docs/a.txt'],
    });
  });

  it('aggregates matching keys through explorer.list()', async () => {
    const basePath = await mkdtemp(path.join(os.tmpdir(), 'edge-kit-storage-'));
    tempDirs.push(basePath);
    const storage = new LocalStorage({ basePath });

    await storage.write('docs/a.txt', 'a');
    await storage.write('docs/nested/b.txt', 'b');
    await storage.write('images/logo.png', 'logo');

    await expect(storage.explorer.list('docs/')).resolves.toEqual([
      'docs/a.txt',
      'docs/nested/b.txt',
    ]);
  });

  it('does not advertise immutable or multipart capabilities', async () => {
    const basePath = await mkdtemp(path.join(os.tmpdir(), 'edge-kit-storage-'));
    tempDirs.push(basePath);
    const storage = new LocalStorage({ basePath });

    expect(storage.immutable).toBeUndefined();
    expect(storage.multipart).toBeUndefined();
  });
});
