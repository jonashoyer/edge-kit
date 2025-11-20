export interface RerankItem<TMeta = any> {
  id: string;
  text: string;
  metadata?: TMeta;
  score?: number;
}

export abstract class AbstractReranker<TMeta = any> {
  /**
   * Rerank items based on relevance to the query.
   * @param query - The search query to rank against
   * @param items - Items to rerank
   * @param topK - Number of top items to return (defaults to all items)
   * @returns Reranked items sorted by relevance score (highest first)
   */
  abstract rerank(
    query: string,
    items: RerankItem<TMeta>[],
    topK?: number
  ): Promise<RerankItem<TMeta>[]>;
}
