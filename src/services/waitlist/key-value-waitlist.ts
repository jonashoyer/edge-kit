import { AbstractWaitlistService, WaitlistEntry } from './abstract-waitlist';
import { AbstractKeyValueService } from '../key-value/abstract-key-value';
import { NamespaceComposer } from '../../composers/namespace-composer';

export class KeyValueWaitlistService extends AbstractWaitlistService {
  namespace = new NamespaceComposer({
    sortedSet: 'waitlist:sorted',
    entry: (email: string) => `waitlist:entry:${email}`,
  });

  constructor(private kv: AbstractKeyValueService) {
    super();
  }

  async join(email: string, metadata?: Record<string, any>): Promise<number> {
    const isExisting = await this.isOnWaitlist(email);
    if (isExisting) {
      return await this.getPosition(email) ?? 0;
    }

    const entry = {
      email,
      joinedAt: new Date().toISOString(),
      metadata,
    } satisfies WaitlistEntry;

    const score = Date.now();

    // Store the entry details
    await this.kv.set(this.namespace.key('entry', email), entry);

    // Add to sorted set with timestamp as score
    await this.kv.zadd(this.namespace.key('sortedSet'), score, email);

    return await this.getPosition(email) ?? 0;
  }

  // Get rank from sorted set (0-based index), consider converting to 1-based position for user display
  async getPosition(email: string): Promise<number | null> {
    const rank = await this.kv.zrank(this.namespace.key('sortedSet'), email);
    if (rank === null) return null;

    return rank;
  }

  async getEntryCount(): Promise<number> {
    return await this.kv.zcard(this.namespace.key('sortedSet')) ?? 0;
  }

  async isOnWaitlist(email: string): Promise<boolean> {
    const rank = await this.kv.zrank(this.namespace.key('sortedSet'), email);
    return rank !== null;
  }

  async getEntries(limit: number, offset: number): Promise<WaitlistEntry[]> {
    // Get paginated emails from sorted set
    const emails = await this.kv.zrange(
      this.namespace.key('sortedSet'),
      offset,
      offset + limit - 1
    );

    if (!emails.length) return [];

    // Get entries in bulk using mget
    const entries = await this.kv.mget<WaitlistEntry>(emails.map(email => this.namespace.key('entry', email)));

    // Filter out any null entries and cast to WaitlistEntry[]
    return entries.filter((entry): entry is WaitlistEntry => entry !== null);
  }

  async removeEntry(email: string): Promise<boolean> {
    const exists = await this.isOnWaitlist(email);
    if (!exists) return false;

    // Remove from both sorted set and entry storage
    await Promise.all([
      this.kv.zrem(this.namespace.key('sortedSet'), email),
      this.kv.delete(this.namespace.key('entry', email))
    ]);

    return true;
  }

  async removeEntries(emails: string[]) {

    // Remove from both sorted set and entry storage in parallel
    await Promise.all([
      this.kv.zrem(
        this.namespace.key('sortedSet'),
        emails
      ),
      this.kv.mdelete(
        emails.map(email => this.namespace.key('entry', email))
      )
    ]);
  }
}
