import type { ReconcileOptions } from '../task-reconciler/abstract-task-reconciler';

export type IncomingHookProvider = 'vercel' | 'github' | 'service' | 'stripe';

export type IncomingHookRequest = {
  method: string;
  pathname: string;
  headers: Record<string, string>;
  rawBody: string;
};

export type VerifiedIncomingHook<TPayload> = {
  provider: IncomingHookProvider;
  event: string;
  deliveryId: string | null;
  payload: TPayload;
  rawBody: string;
  headers: Record<string, string>;
};

export type IncomingHookHandlerMode = 'inline' | 'waitUntil';

export interface IncomingHookVerifier<TPayload> {
  verify(request: IncomingHookRequest): Promise<VerifiedIncomingHook<TPayload>>;
}

export type IncomingHookHandleResult =
  | { kind: 'processed'; status?: 200 | 202; body?: Record<string, unknown> }
  | { kind: 'ignored'; status?: 200; body?: Record<string, unknown> };

export type RunVerifiedHookWithTaskReconcilerOptions<TPayload> = {
  verified: VerifiedIncomingHook<TPayload>;
  reconciler: {
    reconcile(options: ReconcileOptions): Promise<unknown>;
  };
  resolveReconcile: (
    verified: VerifiedIncomingHook<TPayload>
  ) => ReconcileOptions | null;
};
