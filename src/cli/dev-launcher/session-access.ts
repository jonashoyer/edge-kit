import {
  bootstrapDevLauncherSessionInTerminal,
  type DevLauncherBootstrapRuntime,
} from './session-bootstrap';
import {
  DevLauncherRemoteProcessController,
  DevLauncherSessionClient,
  DevLauncherSessionClientError,
  type DevLauncherSessionClientRuntime,
} from './session-client';
import type {
  DevLauncherSessionGetResult,
  DevLauncherSessionMetadata,
  LoadedDevLauncherManifest,
} from './types';

export type DevLauncherSessionAccessMode = 'mutating' | 'read_only';

export interface DevLauncherSessionAccessRuntime {
  bootstrapSession: (
    manifest: LoadedDevLauncherManifest
  ) => Promise<DevLauncherSessionMetadata>;
  clientRuntime: DevLauncherSessionClientRuntime;
  createRemoteController: (
    manifest: LoadedDevLauncherManifest,
    client: DevLauncherSessionClient,
    initialSummary: DevLauncherSessionGetResult
  ) => DevLauncherRemoteProcessController;
  createSessionClient: (
    manifest: LoadedDevLauncherManifest,
    metadata?: DevLauncherSessionMetadata | null
  ) => DevLauncherSessionClient;
}

export interface DevLauncherResolvedSessionAccess {
  client: DevLauncherSessionClient;
  controller: DevLauncherRemoteProcessController;
  summary: DevLauncherSessionGetResult;
}

const createNoSessionError = (): DevLauncherSessionClientError => {
  return new DevLauncherSessionClientError(
    'no_session',
    'No dev launcher session is running for this repo.'
  );
};

export class DevLauncherSessionAccess {
  readonly #manifest: LoadedDevLauncherManifest;
  readonly #runtime: DevLauncherSessionAccessRuntime;

  constructor(
    manifest: LoadedDevLauncherManifest,
    runtime: DevLauncherSessionAccessRuntime
  ) {
    this.#manifest = manifest;
    this.#runtime = runtime;
  }

  static createDefaultRuntime(
    clientRuntime: DevLauncherSessionClientRuntime,
    bootstrapRuntime: DevLauncherBootstrapRuntime
  ): DevLauncherSessionAccessRuntime {
    return {
      bootstrapSession: async (manifest) => {
        return await bootstrapDevLauncherSessionInTerminal(
          manifest,
          bootstrapRuntime
        );
      },
      clientRuntime,
      createRemoteController: (manifest, client, initialSummary) => {
        return new DevLauncherRemoteProcessController(
          manifest,
          client,
          initialSummary
        );
      },
      createSessionClient: (manifest, metadata) => {
        return new DevLauncherSessionClient(manifest, clientRuntime, metadata);
      },
    };
  }

  async resolve(
    mode: DevLauncherSessionAccessMode
  ): Promise<DevLauncherResolvedSessionAccess> {
    const client = this.#runtime.createSessionClient(this.#manifest);
    const metadata = await client.resolveSession();

    if (metadata) {
      return await this.#attach(client);
    }

    if (mode === 'read_only') {
      throw createNoSessionError();
    }

    const bootstrappedMetadata = await this.#runtime.bootstrapSession(this.#manifest);
    return await this.#attach(
      this.#runtime.createSessionClient(this.#manifest, bootstrappedMetadata)
    );
  }

  async resolveExistingMetadata(): Promise<DevLauncherSessionMetadata | null> {
    const client = this.#runtime.createSessionClient(this.#manifest);
    return await client.resolveSession();
  }

  async stop(): Promise<void> {
    const { client } = await this.resolve('read_only');
    try {
      await client.stopSession();
    } catch (error) {
      throw this.#mapTransportFailure(error);
    }
  }

  async #attach(
    client: DevLauncherSessionClient
  ): Promise<DevLauncherResolvedSessionAccess> {
    try {
      const summary = await client.getSession();
      return {
        client,
        controller: this.#runtime.createRemoteController(
          this.#manifest,
          client,
          summary
        ),
        summary,
      };
    } catch (error) {
      throw this.#mapTransportFailure(error);
    }
  }

  #mapTransportFailure(error: unknown): unknown {
    if (!(error instanceof DevLauncherSessionClientError)) {
      return error;
    }

    if (
      error.errorCode === 'socket_closed' ||
      error.errorCode === 'socket_error'
    ) {
      return createNoSessionError();
    }

    return error;
  }
}
