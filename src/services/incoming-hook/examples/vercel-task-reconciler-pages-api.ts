import { InMemoryKeyValueService } from '../../key-value/in-memory-key-value';
import { ConsoleLogger } from '../../logging/console-logger';
import { KvMutex } from '../../mutex/mutex-kv';
import { TaskReconciler } from '../../task-reconciler';
import {
  createPagesRouterIncomingHookHandler,
  incomingHookPagesRouterConfig,
  runVerifiedHookWithTaskReconciler,
  VercelWebhookVerifier,
} from '..';

const kv = new InMemoryKeyValueService();
const logger = new ConsoleLogger();
const reconciler = new TaskReconciler({
  kv,
  mutex: new KvMutex<string>(kv, {
    prefix: '',
    ttlSeconds: 30,
    logger,
  }),
  logger,
});

export const config = incomingHookPagesRouterConfig;

export default createPagesRouterIncomingHookHandler({
  verifier: new VercelWebhookVerifier([process.env.VERCEL_WEBHOOK_SECRET!]),
  logger,
  async handle(verified) {
    if (verified.event !== 'deployment.promoted') {
      return {
        kind: 'ignored',
      };
    }

    await runVerifiedHookWithTaskReconciler({
      verified,
      reconciler,
      resolveReconcile(event) {
        return {
          taskName: 'cache-rebuild',
          desiredRevision: `vercel:${event.deliveryId}`,
          async run() {
            await enqueueCacheRebuild();
          },
        };
      },
    });

    return {
      kind: 'processed',
      body: { received: true },
    };
  },
});

async function enqueueCacheRebuild() {
  throw new Error('Implement cache rebuild enqueue');
}
