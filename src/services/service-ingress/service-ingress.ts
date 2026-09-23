import type { VerifiedIncomingHook } from '../incoming-hook/abstract-incoming-hook';
import { createAppRouterIncomingHookHandler } from '../incoming-hook/app-router-handler';
import { IncomingHookAuthError } from '../incoming-hook/errors';
import {
  createPagesRouterIncomingHookHandler,
  incomingHookPagesRouterConfig,
} from '../incoming-hook/pages-router-handler';
import type { AbstractLogger } from '../logging/abstract-logger';
import {
  createServiceIngressHeaders,
  SignedServiceRequestVerifier,
} from './signed-service-request-verifier';

export type ServiceIngressExecuteResult = Record<string, unknown> | undefined;

type ServiceIngressExecutor = (
  params: unknown
) => Promise<ServiceIngressExecuteResult> | ServiceIngressExecuteResult;

export type ServiceIngress<TParams> = {
  name: string;
  execute?: (
    params: TParams
  ) => Promise<ServiceIngressExecuteResult> | ServiceIngressExecuteResult;
};

type RegisteredServiceIngress = {
  name: string;
  execute?: ServiceIngressExecutor;
};

export const defineServiceIngress = <TParams>(
  ingress: ServiceIngress<TParams>
) => ingress as ServiceIngress<TParams> & RegisteredServiceIngress;

type SendServiceIngressOptions<TParams> = {
  url: string;
  secret: string;
  ingress: ServiceIngress<TParams>;
  params: TParams;
  fetch?: typeof fetch;
  headers?: HeadersInit;
};

export const sendServiceIngress = async <TParams>(
  options: SendServiceIngressOptions<TParams>
) => {
  const rawBody = JSON.stringify(options.params) ?? 'null';
  const url = new URL(options.url);
  const signedHeaders = await createServiceIngressHeaders({
    ingress: options.ingress.name,
    method: 'POST',
    pathname: url.pathname,
    rawBody,
    secret: options.secret,
  });

  const requestHeaders = new Headers(options.headers);
  requestHeaders.set('content-type', 'application/json');
  for (const [header, value] of Object.entries(signedHeaders)) {
    requestHeaders.set(header, value);
  }

  const fetchImplementation = options.fetch ?? globalThis.fetch;
  return await fetchImplementation(options.url, {
    body: rawBody,
    headers: requestHeaders,
    method: 'POST',
  });
};

const createIngressRegistry = (
  ingresses: readonly RegisteredServiceIngress[]
) => {
  const registry = new Map<string, RegisteredServiceIngress>();

  for (const ingress of ingresses) {
    if (registry.has(ingress.name)) {
      throw new Error(`Duplicate service ingress: ${ingress.name}`);
    }

    registry.set(ingress.name, ingress);
  }

  return registry;
};

const dispatchServiceIngressWithRegistry = async (options: {
  verified: VerifiedIncomingHook<unknown>;
  registry: ReadonlyMap<string, RegisteredServiceIngress>;
}) => {
  const ingress = options.registry.get(options.verified.event);
  if (!ingress) {
    throw new IncomingHookAuthError('Unknown service ingress');
  }

  const body = await ingress.execute?.(options.verified.payload);
  return {
    body: body ?? {
      received: true,
    },
    kind: 'processed' as const,
  };
};

export const dispatchServiceIngress = async (options: {
  verified: VerifiedIncomingHook<unknown>;
  ingresses: readonly RegisteredServiceIngress[];
}) => {
  const registry = createIngressRegistry(options.ingresses);
  return await dispatchServiceIngressWithRegistry({
    registry,
    verified: options.verified,
  });
};

type CreateServiceIngressHandlerOptions = {
  ingresses: readonly RegisteredServiceIngress[];
  secrets: string[];
  logger?: AbstractLogger;
};

export const createServiceIngressHandler = (
  options: CreateServiceIngressHandlerOptions
) => {
  const registry = createIngressRegistry(options.ingresses);

  return createAppRouterIncomingHookHandler({
    async handle(verified) {
      return await dispatchServiceIngressWithRegistry({
        registry,
        verified,
      });
    },
    logger: options.logger,
    verifier: new SignedServiceRequestVerifier({
      secrets: options.secrets,
    }),
  });
};

export const serviceIngressPagesRouterConfig = incomingHookPagesRouterConfig;

export const createPagesRouterServiceIngressHandler = (
  options: CreateServiceIngressHandlerOptions
) => {
  const registry = createIngressRegistry(options.ingresses);

  return createPagesRouterIncomingHookHandler({
    async handle(verified) {
      return await dispatchServiceIngressWithRegistry({
        registry,
        verified,
      });
    },
    logger: options.logger,
    verifier: new SignedServiceRequestVerifier({
      secrets: options.secrets,
    }),
  });
};
