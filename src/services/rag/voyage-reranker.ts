import { fetchExt } from '../../utils/fetch-utils';
export interface VoyageRerankerOptions {
  apiKey: string;
  model: 'rerank-2.5' | 'rerank-2.5-lite' | (string & {}); // e.g. 'rerank-1', 'rerank-2'
  baseUrl?: string; // default: https://api.voyageai.com/v1
}

export interface RerankItem<TMeta = any> {
  id: string;
  text: string;
  metadata?: TMeta;
  score?: number;
}

type VoyageRerankResponse = {
  data: Array<{ index: number; relevance_score: number }>;
};

export class VoyageReranker<TMeta = any> {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: VoyageRerankerOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.voyageai.com/v1').replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async rerank(query: string, items: RerankItem<TMeta>[], topK: number = items.length): Promise<RerankItem<TMeta>[]> {
    if (items.length === 0) return [];

    const res = await fetchExt({
      url: `${this.baseUrl}/rerank`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          query,
          documents: items.map((i) => i.text),
        }),
      },
      retries: 2,
      timeout: 15000,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Voyage rerank failed: ${res.status} ${res.statusText} ${text}`);
    }

    const json = (await res.json()) as VoyageRerankResponse;
    const scored = json.data.map((d, idx) => ({ item: items[d.index], score: d.relevance_score, idx }));
    const ranked = scored
      .sort((a, b) => b.score - a.score)
      .map((s) => ({ ...s.item, score: s.score }));
    return ranked.slice(0, topK);
  }
}


