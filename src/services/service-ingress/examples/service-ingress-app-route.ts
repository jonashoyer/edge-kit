import { ConsoleLogger } from '../../logging/console-logger';
import {
  createServiceIngressHandler,
  defineServiceIngress,
} from '../service-ingress';

const logger = new ConsoleLogger();

const searchSyncIngress = defineServiceIngress<{
  revision: string;
}>({
  async execute(params) {
    await enqueueSearchSync(params.revision);
  },
  name: 'search-sync',
});

const cacheRebuildIngress = defineServiceIngress<{
  scope: 'full' | 'partial';
}>({
  async execute(params) {
    await enqueueCacheRebuild(params.scope);
  },
  name: 'cache-rebuild',
});

export const POST = createServiceIngressHandler({
  ingresses: [searchSyncIngress, cacheRebuildIngress],
  logger,
  secrets: [process.env.INTERNAL_SERVICE_INGRESS_SECRET!],
});

async function enqueueSearchSync(revision: string) {
  throw new Error(`Implement search sync enqueue for ${revision}`);
}

async function enqueueCacheRebuild(scope: 'full' | 'partial') {
  throw new Error(`Implement cache rebuild enqueue for ${scope}`);
}
