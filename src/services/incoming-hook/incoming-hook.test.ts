import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import {
  hmacHex,
  parseSignatureHeader,
  verifyHmacHex,
} from '../../utils/crypto-utils';
import { InMemoryKeyValueService } from '../key-value/in-memory-key-value';
import { AbstractMutex, type AcquireResult } from '../mutex/abstract-mutex';
import { TaskReconciler } from '../task-reconciler/task-reconciler';
import { createAppRouterIncomingHookHandler } from './app-router-handler';
import { GitHubWebhookVerifier } from './github-webhook-verifier';
import {
  createPagesRouterIncomingHookHandler,
  incomingHookPagesRouterConfig,
} from './pages-router-handler';
import { StripeIncomingHookVerifier } from './stripe-incoming-hook-verifier';
import { runVerifiedHookWithTaskReconciler } from './task-reconciler-bridge';
import { VercelWebhookVerifier } from './vercel-webhook-verifier';

class RecordingMutex extends AbstractMutex<string> {
  private readonly token = 'recording-token';

  async acquire(): Promise<AcquireResult> {
    return {
      token: this.token,
    };
  }

  async release(): Promise<boolean> {
    return true;
  }

  async refresh(): Promise<boolean> {
    return true;
  }
}

class FakeIncomingMessage extends EventEmitter {
  method = 'POST';
  url = '/api/hooks/test';
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

describe('incoming-hook toolkit', () => {
  it('parses signature headers and verifies HMAC values', async () => {
    const signature = await hmacHex('payload', 'secret', 'sha256');
    expect(parseSignatureHeader(`sha256=${signature}`, 'sha256=')).toBe(
      signature
    );

    const valid = await verifyHmacHex({
      value: 'payload',
      secret: 'secret',
      algorithm: 'sha256',
      expectedHex: signature,
    });
    expect(valid).toBe(true);
  });

  it('verifies Vercel webhook signatures and normalizes the payload', async () => {
    const rawBody = JSON.stringify({
      id: 'delivery_1',
      type: 'deployment.promoted',
      payload: { target: 'production' },
    });
    const signature = await hmacHex(rawBody, 'vercel-secret', 'sha1');
    const verifier = new VercelWebhookVerifier(['vercel-secret']);

    const verified = await verifier.verify({
      method: 'POST',
      pathname: '/api/hooks/vercel',
      headers: {
        'x-vercel-signature': signature,
      },
      rawBody,
    });

    expect(verified.provider).toBe('vercel');
    expect(verified.event).toBe('deployment.promoted');
    expect(verified.deliveryId).toBe('delivery_1');
  });

  it('verifies GitHub webhook signatures and extracts event metadata', async () => {
    const rawBody = JSON.stringify({ action: 'completed' });
    const signature = await hmacHex(rawBody, 'github-secret', 'sha256');
    const verifier = new GitHubWebhookVerifier(['github-secret']);

    const verified = await verifier.verify({
      method: 'POST',
      pathname: '/api/hooks/github',
      headers: {
        'x-hub-signature-256': `sha256=${signature}`,
        'x-github-event': 'deployment_status',
        'x-github-delivery': 'delivery_2',
      },
      rawBody,
    });

    expect(verified.provider).toBe('github');
    expect(verified.event).toBe('deployment_status');
    expect(verified.deliveryId).toBe('delivery_2');
  });

  it('verifies Stripe webhook payloads through Stripe constructEvent', async () => {
    const stripe = new Stripe('sk_test_123', {
      apiVersion: '2025-02-24.acacia',
    });
    const constructEvent = vi
      .spyOn(stripe.webhooks, 'constructEvent')
      .mockReturnValue({
        id: 'evt_123',
        type: 'checkout.session.completed',
      } as Stripe.Event);

    const verifier = new StripeIncomingHookVerifier(stripe, ['whsec_123']);
    const verified = await verifier.verify({
      method: 'POST',
      pathname: '/api/hooks/stripe',
      headers: {
        'stripe-signature': 't=1,v1=abc',
      },
      rawBody: '{"ok":true}',
    });

    expect(constructEvent).toHaveBeenCalled();
    expect(verified.provider).toBe('stripe');
    expect(verified.event).toBe('checkout.session.completed');
    expect(verified.deliveryId).toBe('evt_123');
  });

  it('supports App Router inline mode and waitUntil mode', async () => {
    const rawBody = JSON.stringify({
      id: 'delivery_1',
      type: 'deployment.promoted',
    });
    const signature = await hmacHex(rawBody, 'vercel-secret', 'sha1');

    const inlineHandler = createAppRouterIncomingHookHandler({
      verifier: new VercelWebhookVerifier(['vercel-secret']),
      async handle() {
        return {
          kind: 'processed',
          body: { received: true },
        };
      },
    });

    const inlineResponse = await inlineHandler(
      new Request('https://example.com/api/hooks/vercel', {
        method: 'POST',
        headers: {
          'x-vercel-signature': signature,
          'content-type': 'application/json',
        },
        body: rawBody,
      })
    );

    expect(inlineResponse.status).toBe(200);

    const waitUntil = vi.fn();
    const waitUntilHandler = createAppRouterIncomingHookHandler({
      verifier: new VercelWebhookVerifier(['vercel-secret']),
      mode: 'waitUntil',
      waitUntil,
      async handle(_verified, context) {
        context.waitUntil?.(Promise.resolve());
        return {
          kind: 'processed',
        };
      },
    });

    const waitUntilResponse = await waitUntilHandler(
      new Request('https://example.com/api/hooks/vercel', {
        method: 'POST',
        headers: {
          'x-vercel-signature': signature,
          'content-type': 'application/json',
        },
        body: rawBody,
      })
    );

    expect(waitUntilResponse.status).toBe(202);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it('returns 200 for ignored verified events in waitUntil mode', async () => {
    const rawBody = JSON.stringify({
      id: 'delivery_1',
      type: 'deployment.created',
    });
    const signature = await hmacHex(rawBody, 'vercel-secret', 'sha1');
    const handler = createAppRouterIncomingHookHandler({
      verifier: new VercelWebhookVerifier(['vercel-secret']),
      mode: 'waitUntil',
      waitUntil: vi.fn(),
      async handle() {
        return {
          kind: 'ignored',
          body: { ignored: true },
        };
      },
    });

    const response = await handler(
      new Request('https://example.com/api/hooks/vercel', {
        method: 'POST',
        headers: {
          'x-vercel-signature': signature,
          'content-type': 'application/json',
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(200);
  });

  it('returns 401 for invalid auth and 405 for non-POST methods', async () => {
    const handler = createAppRouterIncomingHookHandler({
      verifier: new VercelWebhookVerifier(['vercel-secret']),
      async handle() {
        return {
          kind: 'processed',
        };
      },
    });

    const invalidAuth = await handler(
      new Request('https://example.com/api/hooks/vercel', {
        method: 'POST',
        headers: {
          'x-vercel-signature': 'bad-signature',
        },
        body: '{}',
      })
    );
    expect(invalidAuth.status).toBe(401);

    const wrongMethod = await handler(
      new Request('https://example.com/api/hooks/vercel', {
        method: 'GET',
      })
    );
    expect(wrongMethod.status).toBe(405);
  });

  it('returns 400 for malformed JSON payloads', async () => {
    const rawBody = '{"badJson":';
    const signature = await hmacHex(rawBody, 'vercel-secret', 'sha1');
    const handler = createAppRouterIncomingHookHandler({
      verifier: new VercelWebhookVerifier(['vercel-secret']),
      async handle() {
        return {
          kind: 'processed',
        };
      },
    });

    const response = await handler(
      new Request('https://example.com/api/hooks/vercel', {
        method: 'POST',
        headers: {
          'x-vercel-signature': signature,
        },
        body: rawBody,
      })
    );

    expect(response.status).toBe(400);
  });

  it('supports Pages Router raw body handling and shared config', async () => {
    expect(incomingHookPagesRouterConfig).toEqual({
      api: {
        bodyParser: false,
      },
    });

    const rawBody = JSON.stringify({
      id: 'delivery_1',
      type: 'deployment.promoted',
    });
    const signature = await hmacHex(rawBody, 'vercel-secret', 'sha1');

    const handler = createPagesRouterIncomingHookHandler({
      verifier: new VercelWebhookVerifier(['vercel-secret']),
      async handle() {
        return {
          kind: 'processed',
          body: { received: true },
        };
      },
    });

    const request = new FakeIncomingMessage(rawBody, {
      'x-vercel-signature': signature,
    }) as unknown as IncomingMessage & {
      method?: string;
      url?: string;
      headers: Record<string, string>;
    };
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

  it('returns 401 from the Pages Router wrapper on invalid auth', async () => {
    const handler = createPagesRouterIncomingHookHandler({
      verifier: new VercelWebhookVerifier(['vercel-secret']),
      async handle() {
        return {
          kind: 'processed',
        };
      },
    });

    const request = new FakeIncomingMessage('{}', {
      'x-vercel-signature': 'bad-signature',
    }) as unknown as IncomingMessage & {
      method?: string;
      url?: string;
      headers: Record<string, string>;
    };
    const response = new FakeResponse() as unknown as ServerResponse & {
      status(code: number): FakeResponse;
      json(body: Record<string, unknown>): void;
    };

    await handler(request, response);

    expect((response as unknown as FakeResponse).statusCode).toBe(401);
  });

  it('requires a real waitUntil implementation for waitUntil mode', () => {
    expect(() =>
      createAppRouterIncomingHookHandler({
        verifier: new VercelWebhookVerifier(['vercel-secret']),
        mode: 'waitUntil',
        async handle() {
          return {
            kind: 'processed',
          };
        },
      })
    ).toThrow(
      'createAppRouterIncomingHookHandler requires waitUntil when mode is waitUntil'
    );

    expect(() =>
      createPagesRouterIncomingHookHandler({
        verifier: new VercelWebhookVerifier(['vercel-secret']),
        mode: 'waitUntil',
        async handle() {
          return {
            kind: 'processed',
          };
        },
      })
    ).toThrow(
      'createPagesRouterIncomingHookHandler requires waitUntil when mode is waitUntil'
    );
  });

  it('bridges verified events into TaskReconciler idempotently', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });
    let runCount = 0;

    const verified = {
      provider: 'vercel' as const,
      event: 'deployment.promoted',
      deliveryId: 'delivery_1',
      payload: {
        project: {
          id: 'project_1',
        },
      },
      rawBody: '{}',
      headers: {},
    };

    const first = await runVerifiedHookWithTaskReconciler({
      verified,
      reconciler,
      resolveReconcile() {
        return {
          taskName: 'documents-index',
          desiredRevision: 'deployment:project_1:delivery_1',
          async run() {
            runCount += 1;
          },
        };
      },
    });

    const second = await runVerifiedHookWithTaskReconciler({
      verified,
      reconciler,
      resolveReconcile() {
        return {
          taskName: 'documents-index',
          desiredRevision: 'deployment:project_1:delivery_1',
          async run() {
            runCount += 1;
          },
        };
      },
    });

    expect(first.kind).toBe('reconciled');
    expect(second.kind).toBe('reconciled');
    expect(runCount).toBe(1);
  });

  it('can ignore a verified event when no reconciliation mapping exists', async () => {
    const kv = new InMemoryKeyValueService();
    const reconciler = new TaskReconciler({
      kv,
      mutex: new RecordingMutex(),
    });

    const result = await runVerifiedHookWithTaskReconciler({
      verified: {
        provider: 'github',
        event: 'ping',
        deliveryId: 'delivery_3',
        payload: { zen: 'keep it logically awesome' },
        rawBody: '{}',
        headers: {},
      },
      reconciler,
      resolveReconcile() {
        return null;
      },
    });

    expect(result.kind).toBe('ignored');
  });
});
