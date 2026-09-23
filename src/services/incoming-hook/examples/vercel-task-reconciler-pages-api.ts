import { InMemoryKeyValueService } from '../../key-value/in-memory-key-value';
import { ConsoleLogger } from '../../logging/console-logger';
import { KvMutex } from '../../mutex/mutex-kv';
import { TaskReconciler } from '../../task-reconciler/task-reconciler';
import {
  createPagesRouterIncomingHookHandler,
  incomingHookPagesRouterConfig,
} from '../pages-router-handler';
import { runVerifiedHookWithTaskReconciler } from '../task-reconciler-bridge';
import { VercelWebhookVerifier } from '../vercel-webhook-verifier';

const kv = new InMemoryKeyValueService();
const logger = new ConsoleLogger();
const reconciler = new TaskReconciler({
  kv,
  logger,
  mutex: new KvMutex<string>(kv, {
    logger,
    prefix: '',
    ttlSeconds: 30,
  }),
});

export const config = incomingHookPagesRouterConfig;

export default createPagesRouterIncomingHookHandler({
  async handle(verified) {
    if (verified.event !== 'deployment.promoted') {
      return {
        kind: 'ignored',
      };
    }

    await runVerifiedHookWithTaskReconciler({
      reconciler,
      resolveReconcile(event) {
        return {
          desiredRevision: `vercel:${event.deliveryId}`,
          async run() {
            await enqueueCacheRebuild();
          },
          taskName: 'cache-rebuild',
        };
      },
      verified,
    });

    return {
      body: { received: true },
      kind: 'processed',
    };
  },
  logger,
  verifier: new VercelWebhookVerifier([process.env.VERCEL_WEBHOOK_SECRET!]),
});

async function enqueueCacheRebuild() {
  throw new Error('Implement cache rebuild enqueue');
}
