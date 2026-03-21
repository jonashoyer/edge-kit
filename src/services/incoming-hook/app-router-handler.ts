import { normalizeHeaders } from '../../utils/http-utils';
import type { AbstractLogger } from '../logging/abstract-logger';
import type {
  IncomingHookHandleResult,
  IncomingHookHandlerMode,
  IncomingHookRequest,
  IncomingHookVerifier,
  VerifiedIncomingHook,
} from './abstract-incoming-hook';
import { IncomingHookMethodError, isIncomingHookError } from './errors';

type WaitUntil = (promise: Promise<unknown>) => Promise<unknown> | undefined;

type AppRouterIncomingHookHandleContext = {
  waitUntil?: WaitUntil;
};

export type AppRouterIncomingHookHandlerOptions<TPayload> = {
  verifier: IncomingHookVerifier<TPayload>;
  mode?: IncomingHookHandlerMode;
  waitUntil?: WaitUntil;
  logger?: AbstractLogger;
  handle: (
    verified: VerifiedIncomingHook<TPayload>,
    context: AppRouterIncomingHookHandleContext
  ) => Promise<IncomingHookHandleResult | undefined>;
};

export const createAppRouterIncomingHookHandler = <TPayload>(
  options: AppRouterIncomingHookHandlerOptions<TPayload>
) => {
  const waitUntilImplementation = options.waitUntil;

  if (options.mode === 'waitUntil' && !waitUntilImplementation) {
    throw new Error(
      'createAppRouterIncomingHookHandler requires waitUntil when mode is waitUntil'
    );
  }

  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST') {
        throw new IncomingHookMethodError();
      }

      const rawBody = await request.text();
      const incomingRequest: IncomingHookRequest = {
        method: request.method,
        pathname: new URL(request.url).pathname,
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
      return Response.json(body, { status });
    } catch (error) {
      if (isIncomingHookError(error)) {
        return Response.json(
          { error: error.message },
          { status: error.status }
        );
      }

      throw error;
    }
  };
};
