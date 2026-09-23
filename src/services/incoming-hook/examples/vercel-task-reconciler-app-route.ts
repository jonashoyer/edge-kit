import { InMemoryKeyValueService } from '../../key-value/in-memory-key-value';
import { ConsoleLogger } from '../../logging/console-logger';
import { KvMutex } from '../../mutex/mutex-kv';
import { TaskReconciler } from '../../task-reconciler/task-reconciler';
import { createAppRouterIncomingHookHandler } from '../app-router-handler';
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
  tasks: [
    {
      resolveDesiredRevision() {
        return 'documents-index-v4';
      },
      async run() {
        await enqueueDocumentReindex();
      },
      taskName: 'documents-index',
    },
    {
      resolveDesiredRevision() {
        return 'cache-rebuild-v2';
      },
      async run() {
        await enqueueCacheRebuild();
      },
      taskName: 'cache-rebuild',
    },
  ],
});

export const POST = createAppRouterIncomingHookHandler({
  async handle(verified) {
    if (verified.event !== 'deployment.promoted') {
      return {
        body: { ignored: true },
        kind: 'ignored',
      };
    }

    const target = verified.payload.payload?.target;
    if (target !== 'production') {
      return {
        body: { ignored: true },
        kind: 'ignored',
      };
    }

    const result = await reconciler.reconcileAll();

    return {
      body: {
        received: true,
        summary: result.summary,
      },
      kind: 'processed',
    };
  },
  logger,
  verifier: new VercelWebhookVerifier([process.env.VERCEL_WEBHOOK_SECRET!]),
});

async function enqueueDocumentReindex() {
  throw new Error('Implement document reindex enqueue');
}

async function enqueueCacheRebuild() {
  throw new Error('Implement cache rebuild enqueue');
}
