import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

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

class FakeIncomingMessage extends IncomingMessage {
  constructor(body: string, headers: Record<string, string> = {}) {
    super(new Socket());
    this.method = 'POST';
    this.url = '/api/internal/service-ingress';
    this.headers = headers;
    this.push(Buffer.from(body));
    this.push(null);
  }
}

class FakeResponse extends ServerResponse {
  jsonBody: Record<string, unknown> | null = null;

  constructor() {
    super(new IncomingMessage(new Socket()));
  }

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
      headers: {
        [SERVICE_TIMESTAMP_HEADER]: timestamp,
        [SERVICE_SIGNATURE_HEADER]: `sha256=${signature}`,
        [SERVICE_INGRESS_HEADER]: 'search-sync',
      },
      method: 'POST',
      pathname: '/api/internal/service-ingress',
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
        headers: {
          [SERVICE_TIMESTAMP_HEADER]: timestamp,
          [SERVICE_SIGNATURE_HEADER]: `sha256=${signature}`,
          [SERVICE_INGRESS_HEADER]: 'search-sync',
        },
        method: 'POST',
        pathname: '/api/internal/service-ingress',
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
      maxDriftMs: Number.MAX_SAFE_INTEGER,
      secrets: ['service-secret'],
    });

    const requests = [
      {
        headers: signedHeaders,
        method: 'PUT',
        pathname: '/api/internal/service-ingress',
        rawBody,
      },
      {
        headers: signedHeaders,
        method: 'POST',
        pathname: '/api/internal/service-ingress/other',
        rawBody,
      },
      {
        headers: {
          ...signedHeaders,
          [SERVICE_TIMESTAMP_HEADER]: '1700000000001',
        },
        method: 'POST',
        pathname: '/api/internal/service-ingress',
        rawBody,
      },
      {
        headers: signedHeaders,
        method: 'POST',
        pathname: '/api/internal/service-ingress',
        rawBody: JSON.stringify({ revision: 'docs-index-v4' }),
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
          execute: searchSync,
          name: 'search-sync',
        }),
        defineServiceIngress<{ scope: string }>({
          execute: cacheRebuild,
          name: 'cache-rebuild',
        }),
      ],
      secrets: ['service-secret'],
    });
    const fetchMock: typeof fetch = vi.fn(async (input, init) => {
      const request = new Request(String(input), init);
      return await handler(request);
    });

    const response = await sendServiceIngress({
      fetch: fetchMock,
      ingress: defineServiceIngress<{ revision: string }>({
        name: 'search-sync',
      }),
      params: { revision: 'docs-index-v4' },
      secret: 'service-secret',
      url: 'https://search.example.com/api/internal/service-ingress',
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
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          ...signedHeaders,
        },
        method: 'POST',
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
        body: rawBody,
        headers: {
          'content-type': 'application/json',
          ...signedHeaders,
        },
        method: 'POST',
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
          execute: vi.fn(),
          name: 'search-sync',
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
    const request = new FakeIncomingMessage(rawBody, signedHeaders);

    request.url = '/api/internal/service-ingress?source=workflow';
    const response = new FakeResponse();

    await handler(request, response);

    expect(response.statusCode).toBe(200);
    expect(response.jsonBody).toEqual({
      received: true,
    });
  });

  it('dispatches directly from a verified event', async () => {
    const execute = vi.fn();

    const result = await dispatchServiceIngress({
      ingresses: [
        defineServiceIngress<{ revision: string }>({
          execute,
          name: 'search-sync',
        }),
      ],
      verified: {
        deliveryId: null,
        event: 'search-sync',
        headers: {},
        payload: { revision: 'docs-index-v4' },
        provider: 'service',
        rawBody: '{"revision":"docs-index-v4"}',
      },
    });

    expect(result).toEqual({
      body: {
        received: true,
      },
      kind: 'processed',
    });
    expect(execute).toHaveBeenCalledWith({ revision: 'docs-index-v4' });
  });

  it('returns an ingress-specific response body when execute provides one', async () => {
    const result = await dispatchServiceIngress({
      ingresses: [
        defineServiceIngress<{ mode: string }>({
          async execute() {
            return {
              mode: 'check',
              summary: {
                checked: 1,
              },
            };
          },
          name: 'task-reconciler',
        }),
      ],
      verified: {
        deliveryId: null,
        event: 'task-reconciler',
        headers: {},
        payload: { mode: 'check' },
        provider: 'service',
        rawBody: '{"mode":"check"}',
      },
    });

    expect(result).toEqual({
      body: {
        mode: 'check',
        summary: {
          checked: 1,
        },
      },
      kind: 'processed',
    });
  });
});
