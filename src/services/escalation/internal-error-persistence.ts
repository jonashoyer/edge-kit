import { fnv1a64 } from '../../utils/crypto-utils';
import { serializeError } from '../../utils/error-utils';
import type { AbstractKeyValueService } from '../key-value/abstract-key-value';

export const INTERNAL_ERROR_TTL_SECONDS = 24 * 60 * 60;

export interface InternalErrorDebugData {
  errorMessage: string;
  errorName: string | null;
  hash: string;
  path: string | null;
  stack: string | null;
}

export interface StoredInternalErrorRecord extends InternalErrorDebugData {
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface StoredInternalErrorActorRecord {
  count: number;
  firstSeenAt: string;
  hash: string;
  impersonatedBy: string | null;
  lastSeenAt: string;
  userId: string;
}

export interface InternalErrorActor {
  impersonatedBy?: string | null;
  userId: string;
}

export interface PersistInternalErrorInput {
  actor?: InternalErrorActor | null;
  error: unknown;
  path?: string;
}

export type PersistedInternalErrorKeys = {
  actorIndexKey?: string;
  actorKey?: string;
  hash: string;
  recordKey: string;
};

export interface InternalErrorPersistenceOptions {
  keyPrefix?: string;
  ttlSeconds?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Determine whether an error uses tRPC's internal-server-error code.
 *
 * @param error - Unknown caught value to inspect
 * @returns Whether the value carries `INTERNAL_SERVER_ERROR`
 */
export const isInternalServerError = (error: unknown): boolean =>
  isRecord(error) && error.code === 'INTERNAL_SERVER_ERROR';

/**
 * Create the stable public identifier used to group matching error messages.
 *
 * @param message - Error message to hash; nullish messages become an empty string
 * @returns Lowercase FNV-1a 64-bit hexadecimal hash
 */
export const getInternalErrorHash = (
  message: string | null | undefined
): string => fnv1a64(message ?? '').toString(16);

/**
 * Create a client-safe internal error message with a support identifier.
 *
 * @param message - Internal error message used only to derive the identifier
 * @returns Public message that does not expose the original error text
 */
export const getPublicInternalErrorMessage = (
  message: string | null | undefined
): string => `Internal server error #${getInternalErrorHash(message)}`;

/**
 * Serialize an error into the diagnostic shape stored by the persistence service.
 *
 * @param input - Error and optional procedure or route path
 * @returns Error details including the unredacted stack and stable message hash
 */
export const buildInternalErrorDebugData = (input: {
  error: unknown;
  path?: string;
}): InternalErrorDebugData => {
  const serialized = serializeError(input.error);
  const errorLike = isRecord(input.error) ? input.error : null;
  const errorMessage =
    typeof errorLike?.message === 'string' && errorLike.message.length > 0
      ? errorLike.message
      : (serialized.message ?? 'Unknown error');
  const errorName =
    typeof errorLike?.name === 'string' && errorLike.name.length > 0
      ? errorLike.name
      : (serialized.name ?? null);
  const stack =
    typeof errorLike?.stack === 'string' && errorLike.stack.length > 0
      ? errorLike.stack
      : (serialized.stack ?? null);

  return {
    errorMessage,
    errorName,
    hash: getInternalErrorHash(errorMessage),
    path: input.path ?? null,
    stack,
  };
};

/**
 * Persist aggregate and optional per-actor diagnostics for internal errors.
 *
 * Records use a sliding TTL and preserve their original `firstSeenAt`. Actor
 * indexes use negative timestamps so ascending sorted-set reads return newest
 * actors first.
 */
export class InternalErrorPersistenceService {
  private readonly keyPrefix: string;
  private readonly kv: AbstractKeyValueService;
  private readonly ttlSeconds: number;

  /**
   * Create an internal-error persistence service.
   *
   * @param kv - Key-value service used for records, TTLs, and actor indexes
   * @param options - Optional key namespace and sliding record TTL
   */
  constructor(
    kv: AbstractKeyValueService,
    options: InternalErrorPersistenceOptions = {}
  ) {
    this.kv = kv;
    this.keyPrefix = options.keyPrefix ?? 'internal-error:';
    this.ttlSeconds = options.ttlSeconds ?? INTERNAL_ERROR_TTL_SECONDS;
  }

  /**
   * Persist an internal error occurrence and refresh its record TTLs.
   *
   * @param input - Error, optional route path, and optional authenticated actor
   * @returns Written key identifiers, or null when the error is not internal
   */
  async persist(
    input: PersistInternalErrorInput
  ): Promise<PersistedInternalErrorKeys | null> {
    if (!isInternalServerError(input.error)) {
      return null;
    }

    const debugData = buildInternalErrorDebugData(input);
    const now = new Date().toISOString();
    const recordKey = this.recordKey(debugData.hash);
    const existingRecord =
      await this.kv.get<StoredInternalErrorRecord>(recordKey);

    await this.kv.set<StoredInternalErrorRecord>(
      recordKey,
      {
        ...debugData,
        count: (existingRecord?.count ?? 0) + 1,
        firstSeenAt: existingRecord?.firstSeenAt ?? now,
        lastSeenAt: now,
      },
      this.ttlSeconds
    );

    if (!input.actor) {
      return { hash: debugData.hash, recordKey };
    }

    const actorKey = this.actorKey(debugData.hash, input.actor.userId);
    const actorIndexKey = this.actorIndexKey(debugData.hash);
    const existingActor =
      await this.kv.get<StoredInternalErrorActorRecord>(actorKey);

    await this.kv.set<StoredInternalErrorActorRecord>(
      actorKey,
      {
        count: (existingActor?.count ?? 0) + 1,
        firstSeenAt: existingActor?.firstSeenAt ?? now,
        hash: debugData.hash,
        impersonatedBy:
          input.actor.impersonatedBy ?? existingActor?.impersonatedBy ?? null,
        lastSeenAt: now,
        userId: input.actor.userId,
      },
      this.ttlSeconds
    );
    await this.kv.zadd(actorIndexKey, -Date.now(), input.actor.userId);
    await this.kv.expire(actorIndexKey, this.ttlSeconds);

    return { actorIndexKey, actorKey, hash: debugData.hash, recordKey };
  }

  private actorIndexKey(hash: string): string {
    return `${this.recordKey(hash)}:actor-index`;
  }

  private actorKey(hash: string, userId: string): string {
    return `${this.recordKey(hash)}:actor:${userId}`;
  }

  private recordKey(hash: string): string {
    return `${this.keyPrefix}${hash}`;
  }
}
