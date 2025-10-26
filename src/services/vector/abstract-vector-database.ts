export type VectorDatabaseOptions = object;

export interface VectorEntry<
  TVector = number[],
  TMetadata = Record<string, any>,
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

export abstract class AbstractVectorDatabase<
  TMetadata = Record<string, any>,
  TVector = number[],
> {
  protected options: VectorDatabaseOptions;
  constructor(options: VectorDatabaseOptions) {
    this.options = options;
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
