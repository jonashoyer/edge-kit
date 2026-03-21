import { ConsoleLogger } from '../../logging/console-logger';
import { createServiceIngressHandler, defineServiceIngress } from '../index';

const logger = new ConsoleLogger();

const searchSyncIngress = defineServiceIngress<{
  revision: string;
}>({
  name: 'search-sync',
  async execute(params) {
    await enqueueSearchSync(params.revision);
    return undefined;
  },
});

const cacheRebuildIngress = defineServiceIngress<{
  scope: 'full' | 'partial';
}>({
  name: 'cache-rebuild',
  async execute(params) {
    await enqueueCacheRebuild(params.scope);
    return undefined;
  },
});

export const POST = createServiceIngressHandler({
  ingresses: [searchSyncIngress, cacheRebuildIngress],
  secrets: [process.env.INTERNAL_SERVICE_INGRESS_SECRET!],
  logger,
});

async function enqueueSearchSync(revision: string) {
  throw new Error(`Implement search sync enqueue for ${revision}`);
}

async function enqueueCacheRebuild(scope: 'full' | 'partial') {
  throw new Error(`Implement cache rebuild enqueue for ${scope}`);
}
