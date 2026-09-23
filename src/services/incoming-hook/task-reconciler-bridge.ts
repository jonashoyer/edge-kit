import type {
  RunVerifiedHookWithTaskReconcilerOptions,
  VerifiedIncomingHook,
} from './abstract-incoming-hook';

export const runVerifiedHookWithTaskReconciler = async <TPayload>(
  options: RunVerifiedHookWithTaskReconcilerOptions<TPayload>
) => {
  const reconcileOptions = options.resolveReconcile(options.verified);
  if (!reconcileOptions) {
    return {
      kind: 'ignored' as const,
      verified: options.verified,
    };
  }

  const result = await options.reconciler.reconcile(reconcileOptions);
  return {
    kind: 'reconciled' as const,
    result,
    verified: options.verified,
  };
};

export const createIgnoreBody = <TPayload>(
  verified: VerifiedIncomingHook<TPayload>
) => ({
  deliveryId: verified.deliveryId,
  event: verified.event,
  ignored: true,
  provider: verified.provider,
});
