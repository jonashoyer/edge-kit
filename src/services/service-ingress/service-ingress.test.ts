import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it, vi } from 'vitest';
import { hmacHex } from '../../utils/crypto-utils';
import {
  createPagesRouterServiceIngressHandler,
  createServiceIngressHandler,
  defineServiceIngress,
  dispatchServiceIngress,
  sendServiceIngress,
  serviceIngressPagesRouterConfig,
} from './service-ingress';
import {
  buildSignedServiceRequestCanonicalString,
  createServiceIngressHeaders,
  SERVICE_INGRESS_HEADER,
  SERVICE_SIGNATURE_HEADER,
  SERVICE_TIMESTAMP_HEADER,
  SignedServiceRequestVerifier,
} from './signed-service-request-verifier';

class FakeIncomingMessage extends EventEmitter {
  method = 'POST';
  url = '/api/internal/service-ingress';
  headers: Record<string, string> = {};
  private readonly chunks: string[];

  constructor(body: string, headers: Record<string, string> = {}) {
    super();
    this.headers = headers;
    this.chunks = [body];
  }

  async *[Symbol.asyncIterator]() {
    for (const chunk of this.chunks) {
      yield chunk;
    }
  }
}

class FakeResponse {
  statusCode = 200;
  jsonBody: Record<string, unknown> | null = null;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(body: Record<string, unknown>) {
    this.jsonBody = body;
  }
}

describe('service-ingress', () => {
  it('verifies signed service requests with timestamp drift checks', async () => {
    const rawBody = JSON.stringify({ revision: 'docs-index-v3' });
    const timestamp = String(Date.now());
    const canonical = buildSignedServiceRequestCanonicalString(
      {
        method: 'POST',
        pathname: '/api/internal/service-ingress',
        rawBody,
      },
      timestamp
    );
    const signature = await hmacHex(canonical, 'service-secret', 'sha256');
    const verifier = new SignedServiceRequestVerifier<{ revision: string }>({
      secrets: ['old-secret', 'service-secret'],
    });

    const verified = await verifier.verify({
      method: 'POST',
      pathname: '/api/internal/service-ingress',
      headers: {
        [SERVICE_TIMESTAMP_HEADER]: timestamp,
        [SERVICE_SIGNATURE_HEADER]: `sha256=${signature}`,
        [SERVICE_INGRESS_HEADER]: 'search-sync',
      },
      rawBody,
    });

    expect(verified.provider).toBe('service');
    expect(verified.event).toBe('search-sync');
  });

  it('rejects a tampered signed request payload', async () => {
    const rawBody = JSON.stringify({ revision: 'docs-index-v3' });
    const timestamp = String(Date.now());
    const signature = await hmacHex(
      buildSignedServiceRequestCanonicalString(
        {
          method: 'POST',
          pathname: '/api/internal/service-ingress',
          rawBody,
        },
        timestamp
      ),
      'service-secret',
      'sha256'
    );
    const verifier = new SignedServiceRequestVerifier<{ revision: string }>({
      secrets: ['service-secret'],
    });

    await expect(
      verifier.verify({
        method: 'POST',
        pathname: '/api/internal/service-ingress',
        headers: {
          [SERVICE_TIMESTAMP_HEADER]: timestamp,
          [SERVICE_SIGNATURE_HEADER]: `sha256=${signature}`,
          [SERVICE_INGRESS_HEADER]: 'search-sync',
        },
        rawBody: JSON.stringify({ revision: 'docs-index-v4' }),
      })
    ).rejects.toThrow('Invalid service request');
  });

  it('rejects tampering of canonical method, pathname, timestamp, or raw body', async () => {
    const rawBody = JSON.stringify({ revision: 'docs-index-v3' });
    const signedHeaders = await createServiceIngressHeaders({
      ingress: 'search-sync',
      method: 'POST',
      pathname: '/api/internal/service-ingress',
      rawBody,
      secret: 'service-secret',
      timestamp: 1_700_000_000_000,
    });
    const verifier = new SignedServiceRequestVerifier<{ revision: string }>({
      secrets: ['service-secret'],
      maxDriftMs: Number.MAX_SAFE_INTEGER,
    });

    const requests = [
      {
        method: 'PUT',
        pathname: '/api/internal/service-ingress',
        rawBody,
        headers: signedHeaders,
      },
      {
        method: 'POST',
        pathname: '/api/internal/service-ingress/other',
        rawBody,
        headers: signedHeaders,
      },
      {
        method: 'POST',
        pathname: '/api/internal/service-ingress',
        rawBody,
        headers: {
          ...signedHeaders,
          [SERVICE_TIMESTAMP_HEADER]: '1700000000001',
        },
      },
      {
        method: 'POST',
        pathname: '/api/internal/service-ingress',
        rawBody: JSON.stringify({ revision: 'docs-index-v4' }),
        headers: signedHeaders,
      },
    ] as const;

    await Promise.all(
      requests.map(async (request) => {
        await expect(verifier.verify(request)).rejects.toThrow(
          'Invalid service request'
        );
      })
    );
  });

  it('dispatches the correct ingress through one shared app-router endpoint', async () => {
    const searchSync = vi.fn();
    const cacheRebuild = vi.fn();
    const handler = createServiceIngressHandler({
      ingresses: [
        defineServiceIngress<{ revision: string }>({
          name: 'search-sync',
          execute: searchSync,
        }),
        defineServiceIngress<{ scope: string }>({
          name: 'cache-rebuild',
          execute: cacheRebuild,
        }),
      ],
      secrets: ['service-secret'],
    });
    const fetchMock: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(String(input), init);
      return await handler(request);
    });

    const response = await sendServiceIngress({
      url: 'https://search.example.com/api/internal/service-ingress',
      secret: 'service-secret',
      ingress: defineServiceIngress<{ revision: string }>({
        name: 'search-sync',
      }),
      params: { revision: 'docs-index-v4' },
      fetch: fetchMock,
    });

    expect(response.status).toBe(200);
    expect(searchSync).toHaveBeenCalledWith({ revision: 'docs-index-v4' });
    expect(cacheRebuild).not.toHaveBeenCalled();
  });

  it('returns 401 for an unknown ingress on a valid signed request', async () => {
    const handler = createServiceIngressHandler({
      ingresses: [
        defineServiceIngress<{ revision: string }>({
          name: 'search-sync',
        }),
      ],
      secrets: ['service-secret'],
    });
    const rawBody = JSON.stringify({ revision: 'docs-index-v4' });
    const signedHeaders = await createServiceIngressHeaders({
      ingress: 'cache-rebuild',
      method: 'POST',
      pathname: '/api/internal/service-ingress',
      rawBody,
      secret: 'service-secret',
    });

    const response = await handler(
      new Request('https://search.example.com/api/internal/service-ingress', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...signedHeaders,
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(401);
  });

  it('rejects duplicate ingress names at handler construction time', () => {
    expect(() =>
      createServiceIngressHandler({
        ingresses: [
          defineServiceIngress<{ revision: string }>({
            name: 'search-sync',
          }),
          defineServiceIngress<{ scope: string }>({
            name: 'search-sync',
          }),
        ],
        secrets: ['service-secret'],
      })
    ).toThrow('Duplicate service ingress: search-sync');
  });

  it('returns 400 for malformed JSON after signature verification', async () => {
    const handler = createServiceIngressHandler({
      ingresses: [
        defineServiceIngress<{ revision: string }>({
          name: 'search-sync',
        }),
      ],
      secrets: ['service-secret'],
    });
    const rawBody = '{"revision":';
    const signedHeaders = await createServiceIngressHeaders({
      ingress: 'search-sync',
      method: 'POST',
      pathname: '/api/internal/service-ingress',
      rawBody,
      secret: 'service-secret',
    });

    const response = await handler(
      new Request('https://search.example.com/api/internal/service-ingress', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...signedHeaders,
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(400);
  });

  it('supports shared-endpoint pages-router handling and config', async () => {
    expect(serviceIngressPagesRouterConfig).toEqual({
      api: {
        bodyParser: false,
      },
    });

    const handler = createPagesRouterServiceIngressHandler({
      ingresses: [
        defineServiceIngress<{ revision: string }>({
          name: 'search-sync',
          execute: vi.fn(),
        }),
      ],
      secrets: ['service-secret'],
    });
    const rawBody = JSON.stringify({ revision: 'docs-index-v4' });
    const signedHeaders = await createServiceIngressHeaders({
      ingress: 'search-sync',
      method: 'POST',
      pathname: '/api/internal/service-ingress',
      rawBody,
      secret: 'service-secret',
    });
    const request = new FakeIncomingMessage(rawBody, signedHeaders) as
      | (IncomingMessage & {
          method?: string;
          url?: string;
          headers: Record<string, string>;
        })
      | undefined;

    if (!request) {
      throw new Error('Expected request');
    }

    request.url = '/api/internal/service-ingress?source=workflow';
    const response = new FakeResponse() as unknown as ServerResponse & {
      status(code: number): FakeResponse;
      json(body: Record<string, unknown>): void;
    };

    await handler(request, response);

    expect((response as unknown as FakeResponse).statusCode).toBe(200);
    expect((response as unknown as FakeResponse).jsonBody).toEqual({
      received: true,
    });
  });

  it('dispatches directly from a verified event', async () => {
    const execute = vi.fn();

    const result = await dispatchServiceIngress({
      verified: {
        provider: 'service',
        event: 'search-sync',
        deliveryId: null,
        payload: { revision: 'docs-index-v4' },
        rawBody: '{"revision":"docs-index-v4"}',
        headers: {},
      },
      ingresses: [
        defineServiceIngress<{ revision: string }>({
          name: 'search-sync',
          execute,
        }),
      ],
    });

    expect(result).toEqual({
      kind: 'processed',
      body: {
        received: true,
      },
    });
    expect(execute).toHaveBeenCalledWith({ revision: 'docs-index-v4' });
  });

  it('returns an ingress-specific response body when execute provides one', async () => {
    const result = await dispatchServiceIngress({
      verified: {
        provider: 'service',
        event: 'task-reconciler',
        deliveryId: null,
        payload: { mode: 'check' },
        rawBody: '{"mode":"check"}',
        headers: {},
      },
      ingresses: [
        defineServiceIngress<{ mode: string }>({
          name: 'task-reconciler',
          async execute() {
            return {
              mode: 'check',
              summary: {
                checked: 1,
              },
            };
          },
        }),
      ],
    });

    expect(result).toEqual({
      kind: 'processed',
      body: {
        mode: 'check',
        summary: {
          checked: 1,
        },
      },
    });
  });
});
