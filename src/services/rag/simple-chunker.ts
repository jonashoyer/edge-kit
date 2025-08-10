export interface ChunkerOptions {
  maxTokens?: number;
  overlapTokens?: number;
}

export type Chunk = { id: string; text: string };

// Very naive token estimation by whitespace splitting
const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.split(/\s+/).length));

export class SimpleChunker {
  private readonly maxTokens: number;
  private readonly overlapTokens: number;

  constructor(options: ChunkerOptions = {}) {
    this.maxTokens = options.maxTokens ?? 300;
    this.overlapTokens = options.overlapTokens ?? 30;
  }

  chunk(text: string, makeId: (index: number) => string): Chunk[] {
    const words = text.split(/\s+/);
    const chunks: Chunk[] = [];

    if (words.length === 0) return chunks;

    const step = Math.max(1, this.maxTokens - this.overlapTokens);
    for (let i = 0, chunkIndex = 0; i < words.length; i += step, chunkIndex += 1) {
      const segment = words.slice(i, i + this.maxTokens).join(' ');
      if (estimateTokens(segment) === 0) continue;
      chunks.push({ id: makeId(chunkIndex), text: segment });
    }
    return chunks;
  }
}


