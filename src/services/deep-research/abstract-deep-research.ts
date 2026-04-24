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
  thinkingSummaries?: DeepResearchThinkingSummaries;
  visualization?: DeepResearchVisualization;
  collaborativePlanning?: boolean;
}

export interface DeepResearchTextInputPart {
  type: 'text';
  text: string;
}

export interface DeepResearchImageInputPart {
  type: 'image';
  uri: string;
  mimeType?: string;
}

export interface DeepResearchDocumentInputPart {
  type: 'document';
  uri: string;
  mimeType: string;
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
  type: 'mcp_server';
  name?: string;
  url?: string;
  headers?: Record<string, string>;
  allowedTools?: string[];
}

export interface DeepResearchFileSearchTool {
  type: 'file_search';
  fileSearchStoreNames: string[];
}

export type DeepResearchTool =
  | DeepResearchGoogleSearchTool
  | DeepResearchUrlContextTool
  | DeepResearchCodeExecutionTool
  | DeepResearchMcpServerTool
  | DeepResearchFileSearchTool;

export interface DeepResearchStartInput {
  input: DeepResearchInput;
  agentMode?: DeepResearchAgentMode;
  agentConfig?: DeepResearchAgentConfig;
  tools?: DeepResearchTool[];
  previousInteractionId?: string;
  providerOptions?: Record<string, unknown>;
}

export interface DeepResearchGetInput {
  id: string;
}

export interface DeepResearchContinueInput
  extends Omit<DeepResearchStartInput, 'previousInteractionId'> {
  previousInteractionId: string;
}

export interface DeepResearchWaitInput extends DeepResearchGetInput {
  pollIntervalMs?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

export interface DeepResearchMessageMetadata {
  interactionId: string;
  provider: string;
  status: DeepResearchStatus;
  agent?: string;
  providerMetadata?: Record<string, unknown>;
}

export interface DeepResearchDataParts {
  [key: string]: Record<string, unknown>;
  'deep-research-output': Record<string, unknown>;
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
  id: string;
  status: DeepResearchStatus;
  provider: string;
  agent?: string;
  message: DeepResearchMessage;
  text?: string;
  error?: DeepResearchProviderError;
  providerMetadata?: Record<string, unknown>;
}

export interface DeepResearchProviderError {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
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
    code: DeepResearchErrorCode;
    message: string;
    interactionId?: string;
    providerError?: DeepResearchProviderError;
  }) {
    super(args.message, args.code);
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
