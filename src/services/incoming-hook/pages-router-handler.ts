import type { IncomingMessage, ServerResponse } from 'node:http';

import { normalizeHeaders, readNodeRequestBody } from '../../utils/http-utils';
import type { AbstractLogger } from '../logging/abstract-logger';
import type {
  IncomingHookHandleResult,
  IncomingHookHandlerMode,
  IncomingHookRequest,
  IncomingHookVerifier,
  VerifiedIncomingHook,
} from './abstract-incoming-hook';
import { IncomingHookMethodError, isIncomingHookError } from './errors';

type PagesApiRequest = IncomingMessage & {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
};

type PagesApiResponse = ServerResponse & {
  status(code: number): PagesApiResponse;
  json(body: Record<string, unknown>): void;
};

type WaitUntil = (promise: Promise<unknown>) => Promise<unknown> | undefined;

type PagesRouterIncomingHookHandleContext = {
  waitUntil?: WaitUntil;
};

export type PagesRouterIncomingHookHandlerOptions<TPayload> = {
  verifier: IncomingHookVerifier<TPayload>;
  mode?: IncomingHookHandlerMode;
  waitUntil?: WaitUntil;
  logger?: AbstractLogger;
  handle: (
    verified: VerifiedIncomingHook<TPayload>,
    context: PagesRouterIncomingHookHandleContext
  ) => Promise<IncomingHookHandleResult | undefined>;
};

export const incomingHookPagesRouterConfig = {
  api: {
    bodyParser: false,
  },
} as const;

const toJsonResponse = (
  response: PagesApiResponse,
  status: number,
  body: Record<string, unknown>
) => {
  response.status(status).json(body);
};

export const createPagesRouterIncomingHookHandler = <TPayload>(
  options: PagesRouterIncomingHookHandlerOptions<TPayload>
) => {
  const waitUntilImplementation = options.waitUntil;

  if (options.mode === 'waitUntil' && !waitUntilImplementation) {
    throw new Error(
      'createPagesRouterIncomingHookHandler requires waitUntil when mode is waitUntil'
    );
  }

  return async (request: PagesApiRequest, response: PagesApiResponse) => {
    try {
      if (request.method !== 'POST') {
        throw new IncomingHookMethodError();
      }

      const rawBody = await readNodeRequestBody(request);
      const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
      const incomingRequest: IncomingHookRequest = {
        method: request.method,
        pathname,
        headers: normalizeHeaders(request.headers),
        rawBody,
      };

      const verified = await options.verifier.verify(incomingRequest);
      let waitUntil: WaitUntil | undefined;
      if (options.mode === 'waitUntil' && waitUntilImplementation) {
        waitUntil = (promise: Promise<unknown>) => {
          return waitUntilImplementation(
            promise.catch((error) => {
              options.logger?.error('incoming-hook.waitUntil failure', {
                error,
              });
              throw error;
            })
          );
        };
      }

      const result = await options.handle(verified, { waitUntil });
      let status = result?.status;
      if (status === undefined) {
        if (result?.kind === 'ignored') {
          status = 200;
        } else if (options.mode === 'waitUntil') {
          status = 202;
        } else {
          status = 200;
        }
      }
      const body =
        result?.body ??
        (result?.kind === 'ignored' ? { ignored: true } : { received: true });
      toJsonResponse(response, status, body);
    } catch (error) {
      if (isIncomingHookError(error)) {
        toJsonResponse(response, error.status, { error: error.message });
        return;
      }

      throw error;
    }
  };
};
