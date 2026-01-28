import { MDocument } from "@mastra/rag";
import { MastraVector } from "@mastra/core/vector";

// We must do our best to integrate our types to match and work with Mastra.
export type RagDocumentLike = MDocument;
export type VectorDatabaseLike = MastraVector;