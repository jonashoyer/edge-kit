import type { MastraVector } from '@mastra/core/vector';
import type { MDocument } from '@mastra/rag';

// We must do our best to integrate our types to match and work with Mastra.
export type RagDocumentLike = MDocument;
export type VectorDatabaseLike = MastraVector;
