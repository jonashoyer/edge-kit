import type { UIMessage, UIMessagePart } from 'ai';

import { CustomError } from '../../utils/custom-error';

export type DeepResearchKnownStatus =
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'requires_action';

export type DeepResearchStatus =
  | DeepResearchKnownStatus
  | (string & { readonly __previewStatus?: never });

export type DeepResearchAgentMode = 'standard' | 'max';

export type DeepResearchThinkingSummaries = 'auto' | 'none';
export type DeepResearchVisualization = 'auto' | 'off';

export interface DeepResearchAgentConfig {
  collaborativePlanning?: boolean;
  thinkingSummaries?: DeepResearchThinkingSummaries;
  visualization?: DeepResearchVisualization;
}

export interface DeepResearchTextInputPart {
  text: string;
  type: 'text';
}

export interface DeepResearchImageInputPart {
  mimeType?: string;
  type: 'image';
  uri: string;
}

export interface DeepResearchDocumentInputPart {
  mimeType: string;
  type: 'document';
  uri: string;
}

export type DeepResearchInputPart =
  | DeepResearchTextInputPart
  | DeepResearchImageInputPart
  | DeepResearchDocumentInputPart;

export type DeepResearchInput = string | DeepResearchInputPart[];

export interface DeepResearchGoogleSearchTool {
  type: 'google_search';
}

export interface DeepResearchUrlContextTool {
  type: 'url_context';
}

export interface DeepResearchCodeExecutionTool {
  type: 'code_execution';
}

export interface DeepResearchMcpServerTool {
  allowedTools?: string[];
  headers?: Record<string, string>;
  name?: string;
  type: 'mcp_server';
  url?: string;
}

export interface DeepResearchFileSearchTool {
  fileSearchStoreNames: string[];
  type: 'file_search';
}

export type DeepResearchTool =
  | DeepResearchGoogleSearchTool
  | DeepResearchUrlContextTool
  | DeepResearchCodeExecutionTool
  | DeepResearchMcpServerTool
  | DeepResearchFileSearchTool;

export interface DeepResearchStartInput {
  agentConfig?: DeepResearchAgentConfig;
  agentMode?: DeepResearchAgentMode;
  input: DeepResearchInput;
  previousInteractionId?: string;
  providerOptions?: Record<string, unknown>;
  tools?: DeepResearchTool[];
}

export interface DeepResearchGetInput {
  id: string;
}

export interface DeepResearchContinueInput
  extends Omit<DeepResearchStartInput, 'previousInteractionId'> {
  previousInteractionId: string;
}

export interface DeepResearchWaitInput extends DeepResearchGetInput {
  abortSignal?: AbortSignal;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

export interface DeepResearchMessageMetadata {
  agent?: string;
  interactionId: string;
  provider: string;
  providerMetadata?: Record<string, unknown>;
  status: DeepResearchStatus;
}

export interface DeepResearchDataParts {
  'deep-research-output': Record<string, unknown>;
  [key: string]: Record<string, unknown>;
}

export type DeepResearchTools = never;

export type DeepResearchOutputPart = UIMessagePart<
  DeepResearchDataParts,
  DeepResearchTools
>;

export type DeepResearchMessage = UIMessage<
  DeepResearchMessageMetadata,
  DeepResearchDataParts,
  DeepResearchTools
>;

export interface DeepResearchInteraction {
  agent?: string;
  error?: DeepResearchProviderError;
  id: string;
  message: DeepResearchMessage;
  provider: string;
  providerMetadata?: Record<string, unknown>;
  status: DeepResearchStatus;
  text?: string;
}

export interface DeepResearchProviderError {
  code?: string;
  details?: Record<string, unknown>;
  message: string;
}

export type DeepResearchErrorCode =
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'FAILED'
  | 'UNSUPPORTED_AGENT';

export class DeepResearchError extends CustomError<DeepResearchErrorCode> {
  readonly interactionId: string | undefined;
  readonly providerError: DeepResearchProviderError | undefined;

  constructor(args: {
    cause?: unknown;
    code: DeepResearchErrorCode;
    message: string;
    interactionId?: string;
    providerError?: DeepResearchProviderError;
  }) {
    super(args.message, args.code, { cause: args.cause });
    this.interactionId = args.interactionId;
    this.providerError = args.providerError;
  }
}

/**
 * Provider-neutral lifecycle for long-running research agents.
 *
 * Deep Research providers expose durable jobs rather than a single text
 * generation call. Callers should persist returned interaction ids and resume
 * polling with `getResearch` or `waitForCompletion`. Completed artifacts are
 * exposed as AI SDK `UIMessage` parts for UI and storage compatibility.
 */
export abstract class AbstractDeepResearchService {
  abstract readonly provider: string;

  abstract startResearch(
    input: DeepResearchStartInput
  ): Promise<DeepResearchInteraction>;

  abstract getResearch(
    input: DeepResearchGetInput
  ): Promise<DeepResearchInteraction>;

  abstract waitForCompletion(
    input: DeepResearchWaitInput
  ): Promise<DeepResearchInteraction>;

  abstract continueResearch(
    input: DeepResearchContinueInput
  ): Promise<DeepResearchInteraction>;

  async start(input: DeepResearchStartInput): Promise<DeepResearchInteraction> {
    return await this.startResearch(input);
  }

  async get(input: DeepResearchGetInput): Promise<DeepResearchInteraction> {
    return await this.getResearch(input);
  }

  async wait(input: DeepResearchWaitInput): Promise<DeepResearchInteraction> {
    return await this.waitForCompletion(input);
  }
}
