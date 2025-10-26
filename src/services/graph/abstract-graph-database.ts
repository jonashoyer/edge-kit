export type GraphProperties = Record<string, string>;

export type GraphEdgeTuple = [string, string];

export type GraphEdgePair = { src: string; tgt: string };

export type NodeDegreesById = Record<string, number>;

export type NodeById = Record<string, GraphProperties>;

export type NodeEdgesById = Record<string, GraphEdgeTuple[]>;

export type EdgeMap<V> = Map<string, Map<string, V>>;

export type KnowledgeGraph = {
  nodes: Array<{ id: string; label?: string; properties: GraphProperties }>;
  edges: Array<{ source: string; target: string; properties: GraphProperties }>;
  isTruncated: boolean;
};

export const normalizeEdge = (a: string, b: string): GraphEdgeTuple =>
  a < b ? [a, b] : [b, a];

export abstract class AbstractGraphDatabase {
  // Existence and degree queries
  abstract hasNode(nodeId: string): Promise<boolean>;
  abstract hasEdge(
    sourceNodeId: string,
    targetNodeId: string
  ): Promise<boolean>;
  abstract nodeDegree(nodeId: string): Promise<number>;
  abstract edgeDegree(srcId: string, tgtId: string): Promise<number>;

  // Entity getters
  abstract getNode(nodeId: string): Promise<GraphProperties | null>;
  abstract getEdge(
    sourceNodeId: string,
    targetNodeId: string
  ): Promise<GraphProperties | null>;
  abstract getNodeEdges(sourceNodeId: string): Promise<GraphEdgeTuple[] | null>;

  // Batch helpers (default naive implementations)
  async getNodes(nodeIds: string[]): Promise<NodeById> {
    const result: NodeById = {};
    for (const nodeId of nodeIds) {
      const node = await this.getNode(nodeId);
      if (node !== null) {
        result[nodeId] = node;
      }
    }
    return result;
  }

  async nodeDegrees(nodeIds: string[]): Promise<NodeDegreesById> {
    const result: NodeDegreesById = {};
    for (const nodeId of nodeIds) {
      // eslint-disable-next-line no-await-in-loop
      const degree = await this.nodeDegree(nodeId);
      result[nodeId] = degree;
    }
    return result;
  }

  async edgeDegrees(edgePairs: GraphEdgeTuple[]): Promise<EdgeMap<number>> {
    const result: EdgeMap<number> = new Map();
    for (const [srcId, tgtId] of edgePairs) {
      const degree = await this.edgeDegree(srcId, tgtId);
      const [u, v] = normalizeEdge(srcId, tgtId);
      let inner = result.get(u);
      if (!inner) {
        inner = new Map();
        result.set(u, inner);
      }
      inner.set(v, degree);
    }
    return result;
  }

  async getEdges(pairs: GraphEdgePair[]): Promise<EdgeMap<GraphProperties>> {
    const result: EdgeMap<GraphProperties> = new Map();
    for (const { src, tgt } of pairs) {
      const edge = await this.getEdge(src, tgt);
      if (edge !== null) {
        const [u, v] = normalizeEdge(src, tgt);
        let inner = result.get(u);
        if (!inner) {
          inner = new Map();
          result.set(u, inner);
        }
        inner.set(v, edge);
      }
    }
    return result;
  }

  async getNodesEdges(nodeIds: string[]): Promise<NodeEdgesById> {
    const result: NodeEdgesById = {};
    for (const nodeId of nodeIds) {
      const edges = await this.getNodeEdges(nodeId);
      result[nodeId] = edges ?? [];
    }
    return result;
  }

  // Mutations
  abstract upsertNode(nodeId: string, nodeData: GraphProperties): Promise<void>;
  abstract upsertEdge(
    sourceNodeId: string,
    targetNodeId: string,
    edgeData: GraphProperties
  ): Promise<void>;
  abstract deleteNode(nodeId: string): Promise<void>;
  abstract removeNodes(nodes: string[]): Promise<void>;
  abstract removeEdges(edges: GraphEdgeTuple[]): Promise<void>;

  // Graph-wide retrieval
  abstract getKnowledgeGraph(
    nodeLabel: string,
    maxDepth?: number,
    maxNodes?: number
  ): Promise<KnowledgeGraph>;

  abstract getAllNodes(): Promise<GraphProperties[]>;
  abstract getAllEdges(): Promise<GraphProperties[]>;

  // Label utilities
  abstract getPopularLabels(limit?: number): Promise<string[]>;
  abstract searchLabels(query: string, limit?: number): Promise<string[]>;
}
