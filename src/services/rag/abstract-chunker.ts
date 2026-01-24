export type Chunk = { id: string; text: string };

/**
 * Abstract base class for text chunking strategies.
 * Splits large text into smaller chunks suitable for embedding and indexing.
 */
export abstract class AbstractChunker {
  abstract chunk(text: string, makeId: (index: number) => string): Chunk[];
}
