import type { AbstractKeyValueService } from "../key-value/abstract-key-value";
import {
  AbstractGraphDatabase,
  applyPagination,
  type GraphEdgeTuple,
  type GraphProperties,
  type GraphPropertiesFilter,
  type GraphQueryEdgesOptions,
  type GraphQueryNodesOptions,
  type GraphSortSpec,
  type KnowledgeGraph,
  matchesFilter,
  normalizeEdge,
  sortBySpecs,
} from "./abstract-graph-database";

// Storage layout (key namespace is kept short to reduce payload sizes):
// - Node document:         g:n:{nodeId} -> GraphProperties (JSON)
// - Edge document:         g:e:{u}:{v}  -> GraphProperties (JSON), where [u,v] is normalized (u < v)
// - Node adjacency (zset): g:adj:{nodeId} -> members = neighbor nodeIds, score = 0
// - Node index (zset):     g:index:nodes -> members = nodeIds, score = 0
// - Edge index (zset):     g:index:edges -> members = `${u}|${v}`, score = 0
// - Label counts (JSON):   g:index:label-counts -> Record<label, number>
//
// Notes:
// - We avoid Redis-specific commands beyond what AbstractKeyValueService exposes. Where a more
//   efficient Redis op would help (e.g., ZREVRANGE, ZSCORE, set intersections), we implement the
//   logic client-side using the provided primitives.

const EDGE_INDEX_MEMBER = (a: string, b: string): string => {
  const [u, v] = normalizeEdge(a, b);
  return `${u}|${v}`;
};

const EDGE_INDEX_SPLIT = (member: string): GraphEdgeTuple => {
  const [u, v] = member.split("|");
  return [u, v];
};

export class KeyValueGraphDatabase extends AbstractGraphDatabase {
  private readonly kv: AbstractKeyValueService;
  private readonly prefix: string;

  KEY_NODE = (nodeId: string): string => `${this.prefix}n:${nodeId}`;
  KEY_EDGE = (a: string, b: string): string => {
    const [u, v] = normalizeEdge(a, b);
    return `${this.prefix}e:${u}:${v}`;
  };
  KEY_ADJ = (nodeId: string): string => `${this.prefix}adj:${nodeId}`;
  KEY_INDEX_NODES = (): string => `${this.prefix}index:nodes`;
  KEY_INDEX_EDGES = (): string => `${this.prefix}index:edges`;

  constructor(kv: AbstractKeyValueService, prefix = "g:") {
    super();
    this.kv = kv;
    this.prefix = prefix ?? "g:";
  }

  // --- Internal helpers to keep method complexity low ---
  private async loadNodeProps(
    ids: string[]
  ): Promise<Array<GraphProperties | null>> {
    if (ids.length === 0) return [];
    const keys = ids.map((id) => this.KEY_NODE(id));
    return await this.kv.mget<GraphProperties>(keys);
  }

  private collectSeeds(
    parsed: Array<{ id: string; props: GraphProperties } | null>,
    targetId: string,
    maxNodes: number
  ): string[] {
    const seeds: string[] = [];
    for (const n of parsed) {
      if (n && n.id === targetId) seeds.push(n.id);
      if (seeds.length >= maxNodes) break;
    }
    return seeds;
  }

  // NOTE: kept for potential future reuse; currently replaced by expandEdgesAndNeighbors
  // private async getNeighbors(id: string): Promise<string[]> {
  //   return await this.kv.zrange(this.KEY_ADJ(id), 0, -1);
  // }

  private async expandEdgesAndNeighbors(currentId: string): Promise<{
    neighbors: string[];
    edges: Array<{
      source: string;
      target: string;
      properties: GraphProperties;
    }>;
  }> {
    const neighbors = await this.kv.zrange(this.KEY_ADJ(currentId), 0, -1);
    if (neighbors.length === 0) return { neighbors: [], edges: [] };
    const pairs = neighbors.map((n) => normalizeEdge(currentId, n));
    const edgeKeys = pairs.map(([u, v]) => this.KEY_EDGE(u, v));
    const props = await this.kv.mget<GraphProperties>(edgeKeys);
    const edges: Array<{
      source: string;
      target: string;
      properties: GraphProperties;
    }> = [];
    for (let i = 0; i < pairs.length; i += 1) {
      const [u, v] = pairs[i] as [string, string];
      edges.push({ source: u, target: v, properties: props[i] ?? {} });
    }
    return { neighbors, edges };
  }

  private initTraversal(seeds: string[]): {
    visited: Set<string>;
    queue: Array<{ id: string; depth: number }>;
  } {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = [];
    for (const s of seeds) {
      if (visited.has(s)) continue;
      visited.add(s);
      queue.push({ id: s, depth: 0 });
    }
    return { visited, queue };
  }

  private async enqueueNeighborsFrom(
    currentId: string,
    ctx: {
      currentDepth: number;
      maxDepth: number;
      visited: Set<string>;
      queue: Array<{ id: string; depth: number }>;
      edgesOut: Array<{
        source: string;
        target: string;
        properties: GraphProperties;
      }>;
      maxNodes: number;
    }
  ): Promise<boolean> {
    if (ctx.currentDepth >= ctx.maxDepth) return false;
    const { neighbors, edges } = await this.expandEdgesAndNeighbors(currentId);
    ctx.edgesOut.push(...edges);
    for (const neighbor of neighbors) {
      if (ctx.visited.size >= ctx.maxNodes) return true;
      if (ctx.visited.has(neighbor)) continue;
      ctx.visited.add(neighbor);
      ctx.queue.push({ id: neighbor, depth: ctx.currentDepth + 1 });
    }
    return false;
  }

  // Existence and degree queries
  async hasNode(nodeId: string): Promise<boolean> {
    return await this.kv.exists(this.KEY_NODE(nodeId));
  }

  async hasEdge(sourceNodeId: string, targetNodeId: string): Promise<boolean> {
    return await this.kv.exists(this.KEY_EDGE(sourceNodeId, targetNodeId));
  }

  async nodeDegree(nodeId: string): Promise<number> {
    return await this.kv.zcard(this.KEY_ADJ(nodeId));
  }

  // Definition choice: edgeDegree returns the number of common neighbors between src and tgt
  // (i.e., triangle count around the edge). This can be adjusted if different semantics are desired.
  async edgeDegree(srcId: string, tgtId: string): Promise<number> {
    const [srcNeighbors, tgtNeighbors] = await Promise.all([
      this.kv.zrange(this.KEY_ADJ(srcId), 0, -1),
      this.kv.zrange(this.KEY_ADJ(tgtId), 0, -1),
    ]);
    if (srcNeighbors.length === 0 || tgtNeighbors.length === 0) return 0;

    // Compute intersection size client-side
    const setA = new Set<string>(srcNeighbors);
    let count = 0;
    for (const n of tgtNeighbors) {
      if (setA.has(n) && n !== srcId && n !== tgtId) count += 1;
    }
    return count;
  }

  // Entity getters
  async getNode(nodeId: string): Promise<GraphProperties | null> {
    return await this.kv.get<GraphProperties>(this.KEY_NODE(nodeId));
  }

  async getEdge(
    sourceNodeId: string,
    targetNodeId: string
  ): Promise<GraphProperties | null> {
    return await this.kv.get<GraphProperties>(
      this.KEY_EDGE(sourceNodeId, targetNodeId)
    );
  }

  async getNodeEdges(sourceNodeId: string): Promise<GraphEdgeTuple[] | null> {
    const neighbors = await this.kv.zrange(this.KEY_ADJ(sourceNodeId), 0, -1);
    if (neighbors.length === 0) return [];
    const result: GraphEdgeTuple[] = [];
    for (const n of neighbors) result.push([sourceNodeId, n]);
    return result;
  }

  // Mutations
  async upsertNode(nodeId: string, nodeData: GraphProperties): Promise<void> {
    const nodeKey = this.KEY_NODE(nodeId);

    await this.kv.set<GraphProperties>(nodeKey, nodeData);
    // ensure node is in the node index
    await this.kv.zadd(this.KEY_INDEX_NODES(), 0, nodeId);
  }

  async upsertEdge(
    sourceNodeId: string,
    targetNodeId: string,
    edgeData: GraphProperties
  ): Promise<void> {
    const edgeKey = this.KEY_EDGE(sourceNodeId, targetNodeId);

    // adjacency updates for an undirected edge
    const [u, v] = normalizeEdge(sourceNodeId, targetNodeId);
    await Promise.all([
      this.kv.set<GraphProperties>(edgeKey, edgeData),
      this.kv.zadd(this.KEY_ADJ(u), 0, v),
      this.kv.zadd(this.KEY_ADJ(v), 0, u),
      this.kv.zadd(this.KEY_INDEX_EDGES(), 0, EDGE_INDEX_MEMBER(u, v)),
    ]);
  }

  async deleteNode(nodeId: string): Promise<void> {
    // Remove all incident edges
    const neighbors = await this.kv.zrange(this.KEY_ADJ(nodeId), 0, -1);
    if (neighbors.length > 0) {
      const toRemove: GraphEdgeTuple[] = neighbors.map(
        (n) => [nodeId, n] as GraphEdgeTuple
      );
      await this.removeEdges(toRemove);
    }

    // Remove node adjacency container and node document
    await Promise.all([
      this.kv.delete(this.KEY_ADJ(nodeId)),
      this.kv.delete(this.KEY_NODE(nodeId)),
      this.kv.zrem(this.KEY_INDEX_NODES(), nodeId),
    ]);
  }

  async removeNodes(nodes: string[]): Promise<void> {
    for (const n of nodes) {
      await this.deleteNode(n);
    }
  }

  async removeEdges(edges: GraphEdgeTuple[]): Promise<void> {
    for (const [a, b] of edges) {
      const [u, v] = normalizeEdge(a, b);
      await Promise.all([
        this.kv.delete(this.KEY_EDGE(u, v)),
        this.kv.zrem(this.KEY_ADJ(u), v),
        this.kv.zrem(this.KEY_ADJ(v), u),
        this.kv.zrem(this.KEY_INDEX_EDGES(), EDGE_INDEX_MEMBER(u, v)),
      ]);
    }
  }

  // Graph-wide retrieval
  async getKnowledgeGraph(
    nodeId: string,
    maxDepth = 2,
    maxNodes = 100
  ): Promise<KnowledgeGraph> {
    const allNodeIds = await this.kv.zrange(this.KEY_INDEX_NODES(), 0, -1);
    if (allNodeIds.length === 0)
      return { nodes: [], edges: [], isTruncated: false };
    const rawNodes = await this.loadNodeProps(allNodeIds);
    const parsedNodes: Array<{ id: string; props: GraphProperties } | null> =
      new Array(allNodeIds.length).fill(null);
    for (let i = 0; i < allNodeIds.length; i += 1) {
      const props = rawNodes[i];
      if (props) parsedNodes[i] = { id: allNodeIds[i] as string, props };
    }

    const seeds = this.collectSeeds(parsedNodes, nodeId, maxNodes);

    const { visited, queue } = this.initTraversal(seeds);

    const nodes: Array<{ id: string; properties: GraphProperties }> = [];
    const edges: Array<{
      source: string;
      target: string;
      properties: GraphProperties;
    }> = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const props = await this.getNode(current.id);
      if (props !== null) nodes.push({ id: current.id, properties: props });

      const truncated = await this.enqueueNeighborsFrom(current.id, {
        currentDepth: current.depth,
        maxDepth,
        visited,
        queue,
        edgesOut: edges,
        maxNodes,
      });
      if (truncated) return { nodes, edges, isTruncated: true };
    }

    return { nodes, edges, isTruncated: false };
  }

  async getAllNodes(): Promise<GraphProperties[]> {
    const ids = await this.kv.zrange(this.KEY_INDEX_NODES(), 0, -1);
    if (ids.length === 0) return [];
    const keys = ids.map((id) => this.KEY_NODE(id));
    const nodes = await this.kv.mget<GraphProperties>(keys);
    return nodes.filter((node): node is GraphProperties => node !== null);
  }

  async getAllEdges(): Promise<GraphProperties[]> {
    const members = await this.kv.zrange(this.KEY_INDEX_EDGES(), 0, -1);
    if (members.length === 0) return [];
    const keys = members.map((m) => {
      const [u, v] = EDGE_INDEX_SPLIT(m);
      return this.KEY_EDGE(u, v);
    });

    const edges = await this.kv.mget<GraphProperties>(keys);
    return edges.filter((edge): edge is GraphProperties => edge !== null);
  }

  // Query APIs (scan + filter)
  async queryNodes(
    options?: GraphQueryNodesOptions
  ): Promise<Array<{ id: string; properties: GraphProperties }>> {
    const allIds = await this.kv.zrange(this.KEY_INDEX_NODES(), 0, -1);
    if (allIds.length === 0) return [];
    const keys = allIds.map((id) => this.KEY_NODE(id));
    const raw = await this.kv.mget<GraphProperties>(keys);
    const items: Array<{ id: string; properties: GraphProperties }> = [];
    for (let i = 0; i < raw.length; i += 1) {
      const props = raw[i];
      if (props && matchesFilter(props, options?.filter)) {
        items.push({ id: allIds[i] as string, properties: props });
      }
    }
    const sorted = sortBySpecs(items, options?.sort);
    return applyPagination(sorted, options?.offset, options?.limit);
  }

  async queryEdges(
    options?: GraphQueryEdgesOptions
  ): Promise<
    Array<{ source: string; target: string; properties: GraphProperties }>
  > {
    const members = await this.kv.zrange(this.KEY_INDEX_EDGES(), 0, -1);
    if (members.length === 0) return [];
    const keys = members.map((m) => {
      const [u, v] = EDGE_INDEX_SPLIT(m);
      return this.KEY_EDGE(u, v);
    });
    const raw = await this.kv.mget<GraphProperties>(keys);
    const edges: Array<{
      source: string;
      target: string;
      properties: GraphProperties;
    }> = [];
    for (let i = 0; i < members.length; i += 1) {
      const props = raw[i];
      if (!props) continue;
      if (!matchesFilter(props, options?.filter)) continue;
      const [u, v] = EDGE_INDEX_SPLIT(members[i] as string);
      edges.push({ source: u, target: v, properties: props });
    }
    const sorted = sortBySpecs(edges, options?.sort);
    return applyPagination(sorted, options?.offset, options?.limit);
  }

  async neighbors(
    nodeId: string,
    options?: {
      nodeFilter?: GraphPropertiesFilter;
      edgeFilter?: GraphPropertiesFilter;
      sort?: GraphSortSpec[];
      offset?: number;
      limit?: number;
    }
  ): Promise<Array<{ id: string; properties: GraphProperties }>> {
    const neighbors = await this.kv.zrange(this.KEY_ADJ(nodeId), 0, -1);
    if (neighbors.length === 0) return [];
    const nodeKeys = neighbors.map((id) => this.KEY_NODE(id));
    const nodeProps = await this.kv.mget<GraphProperties>(nodeKeys);

    // Optional edge filtering: only keep neighbors where edge matches
    let keep: boolean[] = new Array(neighbors.length).fill(true);
    if (options?.edgeFilter) {
      const edgeKeys = neighbors.map((n) => this.KEY_EDGE(nodeId, n));
      const edgeProps = await this.kv.mget<GraphProperties>(edgeKeys);
      keep = edgeProps.map((p) =>
        p ? matchesFilter(p, options.edgeFilter) : false
      );
    }

    const items: Array<{ id: string; properties: GraphProperties }> = [];
    for (let i = 0; i < neighbors.length; i += 1) {
      if (!keep[i]) continue;
      const props = nodeProps[i];
      if (props && matchesFilter(props, options?.nodeFilter)) {
        items.push({ id: neighbors[i] as string, properties: props });
      }
    }
    const sorted = sortBySpecs(items, options?.sort);
    return applyPagination(sorted, options?.offset, options?.limit);
  }
}
