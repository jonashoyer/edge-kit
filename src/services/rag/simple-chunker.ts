import type { AbstractChunker, Chunk } from "./abstract-chunker";

export interface ChunkerOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

// Very naive token estimation by whitespace splitting
const estimateTokens = (text: string) =>
  Math.max(1, Math.ceil(text.split(WHITESPACE_REGEX).length));

const WHITESPACE_REGEX = /\s+/;

export class SimpleChunker implements AbstractChunker {
  private readonly maxTokens: number;
  private readonly overlapTokens: number;

  constructor(options: ChunkerOptions = {}) {
    this.maxTokens = options.maxTokens ?? 300;
    this.overlapTokens = options.overlapTokens ?? 30;
  }

  chunk(text: string, makeId: (index: number) => string): Chunk[] {
    const words = text.split(WHITESPACE_REGEX);
    const chunks: Chunk[] = [];

    if (words.length === 0) return chunks;

    const step = Math.max(1, this.maxTokens - this.overlapTokens);
    for (
      let i = 0, chunkIndex = 0;
      i < words.length;
      i += step, chunkIndex += 1
    ) {
      const segment = words.slice(i, i + this.maxTokens).join(" ");
      if (estimateTokens(segment) === 0) continue;
      chunks.push({ id: makeId(chunkIndex), text: segment });
    }
    return chunks;
  }
}
