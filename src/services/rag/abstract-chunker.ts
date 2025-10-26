export type Chunk = { id: string; text: string };

export abstract class AbstractChunker {
  abstract chunk(text: string, makeId: (index: number) => string): Chunk[];
}
