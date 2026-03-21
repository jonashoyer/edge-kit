export type VectorContentProvider = (
  namespace: string,
  ids: string[]
) => Promise<(string | null)[]>;

export type VectorDatabaseOptions<TContentCapability extends boolean = false> =
  TContentCapability extends true
    ? {
        getContent: VectorContentProvider;
      }
    : {
        getContent?: undefined;
      };

export type VectorDatabaseWithContent<
  TMetadata = Record<string, unknown>,
  TVector = number[],
> = AbstractVectorDatabase<TMetadata, TVector, true> & {
  getContent: VectorContentProvider;
};

export interface VectorEntry<
  TVector = number[],
  TMetadata = Record<string, unknown>,
  TIncludeVectors extends boolean = false,
  TIncludeMetadata extends boolean = false,
> {
  id: string;
  vector: TIncludeVectors extends true ? TVector : never;
  metadata: TIncludeMetadata extends true ? TMetadata : never;
}

export interface VectorQueryOptions<
  TIncludeVectors extends boolean,
  TIncludeMetadata extends boolean,
> {
  includeVectors?: TIncludeVectors;
  includeMetadata?: TIncludeMetadata;
}

/**
 * Abstract base class for Vector Databases.
 * Defines the contract for storing and querying high-dimensional vectors.
 * Supports namespace isolation, metadata storage, and top-k similarity search.
 */
export abstract class AbstractVectorDatabase<
  TMetadata = Record<string, unknown>,
  TVector = number[],
  TContentCapability extends boolean = false,
> {
  protected options: VectorDatabaseOptions<TContentCapability>;
  readonly getContent: TContentCapability extends true
    ? VectorContentProvider
    : undefined;

  constructor(options: VectorDatabaseOptions<TContentCapability>) {
    this.options = options;
    this.getContent = options.getContent as TContentCapability extends true
      ? VectorContentProvider
      : undefined;
  }

  abstract upsert(
    namespace: string,
    entries: VectorEntry<TVector, TMetadata, true, true>[]
  ): Promise<void>;
  abstract delete(namespace: string, ids: string[]): Promise<void>;

  abstract query<
    TIncludeVectors extends boolean,
    TIncludeMetadata extends boolean,
  >(
    namespace: string,
    vector: TVector,
    topK: number,
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>
  ): Promise<VectorEntry<TVector, TMetadata, TIncludeVectors>[]>;
  abstract list<
    TIncludeVectors extends boolean,
    TIncludeMetadata extends boolean,
  >(
    namespace: string,
    ids: string[],
    opts?: VectorQueryOptions<TIncludeVectors, TIncludeMetadata>
  ): Promise<
    (VectorEntry<
      TVector,
      TMetadata,
      TIncludeVectors,
      TIncludeMetadata
    > | null)[]
  >;
}
