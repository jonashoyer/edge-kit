import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { DevLauncherSessionClientRuntime } from './session-client';
import {
  DevLauncherSessionClient,
  type DevLauncherSessionClientError,
} from './session-client';
import type {
  DevLauncherSessionMetadata,
  LoadedDevLauncherManifest,
} from './types';

class FakeSocket extends EventEmitter {
  constructor() {
    super();

    queueMicrotask(() => {
      this.emit('connect');
    });
  }

  destroy(): void {}

  end(): void {}

  write(_chunk: string): boolean {
    queueMicrotask(() => {
      this.emit('end');
    });
    return true;
  }
}

const createManifest = (): LoadedDevLauncherManifest => ({
  actionIdsInOrder: [],
  actionsById: {},
  configPath: '/repo/dev-cli.config.ts',
  packageManager: 'pnpm',
  repoRoot: '/repo',
  serviceIdsInOrder: ['app'],
  servicesById: {
    app: {
      label: 'App',
      target: {
        kind: 'root-script',
        script: 'dev',
      },
    },
  },
  version: 1,
});

const createMetadata = (): DevLauncherSessionMetadata => ({
  mode: 'foreground',
  pid: 123,
  repoRoot: '/repo',
  sessionId: 'session-1',
  socketPath: '/tmp/dev-launcher.sock',
  startedAt: 1,
  version: 1,
});

const createRuntime = (): DevLauncherSessionClientRuntime => ({
  clearInterval,
  connectSocket: async () => true,
  connectSocketClient: () => new FakeSocket(),
  env: process.env,
  existsSync: () => true,
  homedir: () => '/tmp',
  kill: () => true,
  mkdirSync: () => undefined,
  processId: 1,
  randomUUID: () => 'request-1',
  readFileSync: () => '',
  setInterval,
  setTimeout,
  statSync: (() => {
    throw new Error('not implemented');
  }) as never,
  unlinkSync: () => undefined,
  writeFileSync: () => undefined,
});

describe('DevLauncherSessionClient', () => {
  it('rejects when the socket closes before responding', async () => {
    const client = new DevLauncherSessionClient(
      createManifest(),
      createRuntime(),
      createMetadata()
    );

    await expect(client.getSession()).rejects.toMatchObject<
      Partial<DevLauncherSessionClientError>
    >({
      errorCode: 'socket_closed',
      message: 'Dev launcher session closed before responding.',
    });
  });
});
