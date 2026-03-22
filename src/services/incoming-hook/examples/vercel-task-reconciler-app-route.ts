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
  mutex: new KvMutex<string>(kv, {
    prefix: '',
    ttlSeconds: 30,
    logger,
  }),
  logger,
  tasks: [
    {
      taskName: 'documents-index',
      resolveDesiredRevision() {
        return 'documents-index-v4';
      },
      async run() {
        await enqueueDocumentReindex();
      },
    },
    {
      taskName: 'cache-rebuild',
      resolveDesiredRevision() {
        return 'cache-rebuild-v2';
      },
      async run() {
        await enqueueCacheRebuild();
      },
    },
  ],
});

export const POST = createAppRouterIncomingHookHandler({
  verifier: new VercelWebhookVerifier([process.env.VERCEL_WEBHOOK_SECRET!]),
  logger,
  async handle(verified) {
    if (verified.event !== 'deployment.promoted') {
      return {
        kind: 'ignored',
        body: { ignored: true },
      };
    }

    const target = verified.payload.payload?.target;
    if (target !== 'production') {
      return {
        kind: 'ignored',
        body: { ignored: true },
      };
    }

    const result = await reconciler.reconcileAll();

    return {
      kind: 'processed',
      body: {
        received: true,
        summary: result.summary,
      },
    };
  },
});

async function enqueueDocumentReindex() {
  throw new Error('Implement document reindex enqueue');
}

async function enqueueCacheRebuild() {
  throw new Error('Implement cache rebuild enqueue');
}
