import type { ClientOptions } from '@notionhq/client/build/src/Client';
import type { SupportedFetch } from '@notionhq/client/build/src/fetch-types';
import { Throttler } from '../../utils/throttler';
import { NotionError } from './notion-errors';

/** Set false to disable pacing, for example when a shared transport already limits requests. */
export type NotionPacingOptions =
  | false
  | {
      minimumIntervalMs?: number;
      requestsPerMinute?: number;
    };

/** SDK options plus optional request pacing and read-only enforcement. */
export type NotionClientOptions = Omit<ClientOptions, 'auth'> & {
  pacing?: NotionPacingOptions;
  readOnly?: boolean;
};

const READ_PATH =
  /^(?:pages\/[^/]+(?:\/markdown|\/properties\/[^/]+)?|blocks\/[^/]+(?:\/children)?|databases\/[^/]+|data_sources\/[^/]+(?:\/templates)?|users(?:\/[^/]+)?|comments(?:\/[^/]+)?|file_uploads(?:\/[^/]+)?)$/;
const QUERY_PATH = /^data_sources\/[^/]+\/query$/;

/** Wraps each SDK fetch attempt. The SDK remains the only retry owner. */
export function createNotionFetch(
  options: NotionClientOptions
): SupportedFetch {
  const readOnly = options.readOnly ?? false;
  const fetch = options.fetch ?? globalThis.fetch;
  // biome-ignore lint/suspicious/noUnnecessaryConditions: Copied clients may run where globalThis.fetch is absent despite DOM type declarations.
  if (!fetch)
    throw new NotionError(
      'NotionClient requires a fetch implementation',
      'invalid_configuration'
    );
  // Match the SDK's baseUrl + '/v1/' concatenation, including trailing slashes.
  const apiBase = new URL(`${options.baseUrl ?? 'https://api.notion.com'}/v1/`);
  const throttler = new Throttler(
    options.pacing === false
      ? { enabled: false }
      : {
          minimumIntervalMs: options.pacing?.minimumIntervalMs ?? 350,
          requestsPerMinute: options.pacing?.requestsPerMinute,
        }
  );
  return async (url, init) => {
    if (readOnly) {
      const requestUrl = new URL(url);
      const path = requestUrl.pathname.startsWith(apiBase.pathname)
        ? requestUrl.pathname.slice(apiBase.pathname.length)
        : '';
      const method = (init?.method ?? 'GET').toUpperCase();
      const allowed =
        requestUrl.origin === apiBase.origin &&
        ((method === 'GET' && READ_PATH.test(path)) ||
          (method === 'POST' && (path === 'search' || QUERY_PATH.test(path))));
      if (!allowed)
        throw new NotionError(
          `Notion readOnly client denied ${method} ${requestUrl.pathname}`,
          'read_only'
        );
    }
    await throttler.waitForSlot();
    return fetch(url, init);
  };
}
