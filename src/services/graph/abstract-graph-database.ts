export type GraphProperties = Record<string, string | number | boolean | null>;

export type GraphEdgeTuple = [string, string];

export type GraphEdgePair = { src: string; tgt: string };

export type NodeDegreesById = Record<string, number>;

export type NodeById = Record<string, GraphProperties>;

export type NodeEdgesById = Record<string, GraphEdgeTuple[]>;

export type EdgeMap<V> = Map<string, Map<string, V>>;

export type KnowledgeGraph = {
  nodes: Array<{ id: string; properties: GraphProperties }>;
  edges: Array<{ source: string; target: string; properties: GraphProperties }>;
  isTruncated: boolean;
};

// Querying and filtering types
export type GraphComparisonOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notIn'
  | 'exists'
  | 'notExists';

export type GraphPrimitive = string | number | boolean | null;

export type PropertyCondition = {
  key: string;
  op: GraphComparisonOperator;
  value?: GraphPrimitive | GraphPrimitive[];
};

export type GraphPropertiesFilter = {
  all?: PropertyCondition[]; // AND
  any?: PropertyCondition[]; // OR
  none?: PropertyCondition[]; // NOT
};

export type GraphSortDirection = 'asc' | 'desc';
export type GraphNullsPosition = 'first' | 'last';
export type GraphSortSpec = {
  key: string;
  direction?: GraphSortDirection;
  nulls?: GraphNullsPosition;
};

export type GraphQueryNodesOptions = {
  filter?: GraphPropertiesFilter;
  sort?: GraphSortSpec[];
  offset?: number;
  limit?: number;
};

export type GraphQueryEdgesOptions = {
  filter?: GraphPropertiesFilter;
  sort?: GraphSortSpec[];
  offset?: number;
  limit?: number;
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

  // Query APIs
  abstract queryNodes(
    options?: GraphQueryNodesOptions
  ): Promise<Array<{ id: string; properties: GraphProperties }>>;

  abstract queryEdges(
    options?: GraphQueryEdgesOptions
  ): Promise<
    Array<{ source: string; target: string; properties: GraphProperties }>
  >;

  // Neighborhood traversal (depth=1)
  abstract neighbors(
    nodeId: string,
    options?: {
      nodeFilter?: GraphPropertiesFilter;
      edgeFilter?: GraphPropertiesFilter;
      sort?: GraphSortSpec[];
      offset?: number;
      limit?: number;
    }
  ): Promise<Array<{ id: string; properties: GraphProperties }>>;

  // Label utilities
  // abstract getPopularLabels(limit?: number): Promise<string[]>;
  // abstract searchLabels(query: string, limit?: number): Promise<string[]>;
}

// ------- Helper utilities (shared by implementations) -------

export const getProperty = (
  obj: GraphProperties | null | undefined,
  key: string
): GraphPrimitive => {
  if (!obj) return null;
  return (obj[key] as GraphPrimitive) ?? null;
};

export const comparePrimitives = (
  a: GraphPrimitive,
  b: GraphPrimitive
): number => {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : 1;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    if (a === b) return 0;
    return a === true ? 1 : -1;
  }
  const sa = String(a);
  const sb = String(b);
  if (sa === sb) return 0;
  return sa < sb ? -1 : 1;
};

const isNum = (x: unknown): x is number => typeof x === 'number';
const isStr = (x: unknown): x is string => typeof x === 'string';

type OpHandler = (
  value: GraphPrimitive,
  expected?: GraphPrimitive | GraphPrimitive[]
) => boolean;

const OP_HANDLERS: Record<GraphComparisonOperator, OpHandler> = {
  exists: (value) => value !== null,
  notExists: (value) => value === null,
  eq: (value, expected) => value === (expected as GraphPrimitive),
  ne: (value, expected) => value !== (expected as GraphPrimitive),
  gt: (value, expected) =>
    isNum(value) && isNum(expected) ? value > expected : false,
  gte: (value, expected) =>
    isNum(value) && isNum(expected) ? value >= expected : false,
  lt: (value, expected) =>
    isNum(value) && isNum(expected) ? value < expected : false,
  lte: (value, expected) =>
    isNum(value) && isNum(expected) ? value <= expected : false,
  contains: (value, expected) =>
    isStr(value) && isStr(expected) ? value.includes(expected) : false,
  startsWith: (value, expected) =>
    isStr(value) && isStr(expected) ? value.startsWith(expected) : false,
  endsWith: (value, expected) =>
    isStr(value) && isStr(expected) ? value.endsWith(expected) : false,
  in: (value, expected) =>
    Array.isArray(expected) ? expected.some((v) => v === value) : false,
  notIn: (value, expected) =>
    Array.isArray(expected) ? expected.every((v) => v !== value) : true,
};

export const matchesCondition = (
  props: GraphProperties | null,
  condition: PropertyCondition
): boolean => {
  const value = getProperty(props, condition.key);
  const handler = OP_HANDLERS[condition.op];
  return handler(value, condition.value);
};

const everyCondition = (
  props: GraphProperties | null,
  conds?: PropertyCondition[]
): boolean => {
  if (!conds || conds.length === 0) return true;
  for (const c of conds) {
    if (!matchesCondition(props, c)) return false;
  }
  return true;
};

const someCondition = (
  props: GraphProperties | null,
  conds?: PropertyCondition[]
): boolean => {
  if (!conds || conds.length === 0) return true;
  for (const c of conds) {
    if (matchesCondition(props, c)) return true;
  }
  return false;
};

export const matchesFilter = (
  props: GraphProperties | null,
  filter?: GraphPropertiesFilter
): boolean => {
  if (!filter) return true;
  const { all, any, none } = filter;
  if (!everyCondition(props, all)) return false;
  if (any && !someCondition(props, any)) return false;
  if (none && someCondition(props, none)) return false;
  return true;
};

const compareBySpec = (
  a: GraphProperties,
  b: GraphProperties,
  spec: GraphSortSpec
): number => {
  const dir = spec.direction === 'desc' ? -1 : 1;
  const nulls: GraphNullsPosition = spec.nulls ?? 'last';
  const av = getProperty(a, spec.key);
  const bv = getProperty(b, spec.key);
  if (av === null && bv === null) return 0;
  if (av === null && bv !== null) return nulls === 'first' ? -1 : 1;
  if (bv === null && av !== null) return nulls === 'first' ? 1 : -1;
  const cmp = comparePrimitives(av, bv);
  if (cmp === 0) return 0;
  return cmp * dir;
};

export const buildComparator = (
  specs?: GraphSortSpec[]
): ((
  a: { properties: GraphProperties },
  b: { properties: GraphProperties }
) => number) => {
  if (!specs || specs.length === 0) {
    return () => 0;
  }
  return (a, b) => {
    for (const spec of specs) {
      const v = compareBySpec(a.properties, b.properties, spec);
      if (v !== 0) return v;
    }
    return 0;
  };
};

export const sortBySpecs = <Item extends { properties: GraphProperties }>(
  items: Item[],
  specs?: GraphSortSpec[]
): Item[] => {
  if (!specs || specs.length === 0) return items;
  const cloned = items.slice();
  const comparator = buildComparator(specs);
  cloned.sort((a, b) => comparator(a, b));
  return cloned;
};

export const applyPagination = <T>(
  items: T[],
  offset?: number,
  limit?: number
): T[] => {
  const start = typeof offset === 'number' && offset > 0 ? offset : 0;
  const end =
    typeof limit === 'number' && limit >= 0 ? start + limit : items.length;
  return items.slice(start, end);
};
