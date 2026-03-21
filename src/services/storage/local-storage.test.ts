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
        await rm(dir, { recursive: true, force: true });
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
      keys: ['docs/a.txt'],
      continuationToken: '1',
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
});
