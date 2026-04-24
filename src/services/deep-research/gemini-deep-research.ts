import { z } from 'zod';

import { fetchExt } from '../../utils/fetch-utils';
import {
  AbstractDeepResearchService,
  type DeepResearchContinueInput,
  type DeepResearchDocumentInputPart,
  DeepResearchError,
  type DeepResearchGetInput,
  type DeepResearchImageInputPart,
  type DeepResearchInput,
  type DeepResearchInputPart,
  type DeepResearchInteraction,
  type DeepResearchMessage,
  type DeepResearchOutputPart,
  type DeepResearchProviderError,
  type DeepResearchStartInput,
  type DeepResearchTool,
  type DeepResearchWaitInput,
} from './abstract-deep-research';

export const SUPPORTED_GEMINI_DEEP_RESEARCH_AGENT_IDS = [
  'deep-research-preview-04-2026',
  'deep-research-max-preview-04-2026',
] as const;

export type GeminiDeepResearchAgentId =
  (typeof SUPPORTED_GEMINI_DEEP_RESEARCH_AGENT_IDS)[number];

export interface GeminiDeepResearchServiceOptions {
  apiKey: string;
  agent?: GeminiDeepResearchAgentId;
  baseUrl?: string;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

type GeminiInputPart =
  | { type: 'text'; text: string }
  | { type: 'image'; uri: string; mime_type?: string }
  | { type: 'document'; uri: string; mime_type: string };

type GeminiTool =
  | { type: 'google_search' }
  | { type: 'url_context' }
  | { type: 'code_execution' }
  | {
      type: 'mcp_server';
      name?: string;
      url?: string;
      headers?: Record<string, string>;
      allowed_tools?: string[];
    }
  | { type: 'file_search'; file_search_store_names: string[] };

const defaultBaseUrl = 'https://generativelanguage.googleapis.com/v1beta';
const defaultAgent = 'deep-research-preview-04-2026';
const defaultPollIntervalMs = 10_000;
const defaultRequestTimeoutMs = 60_000;
const transientHttpStatuses = [408, 409, 425, 429, 500, 502, 503, 504];

const providerErrorSchema = z
  .object({
    code: z.string().optional(),
    message: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const geminiOutputSchema = z
  .object({
    type: z.string().optional(),
    id: z.string().optional(),
    text: z.string().optional(),
    data: z.string().optional(),
    url: z.string().optional(),
    uri: z.string().optional(),
    title: z.string().optional(),
    source_type: z.string().optional(),
    mime_type: z.string().optional(),
    media_type: z.string().optional(),
    content: z
      .object({
        text: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const geminiInteractionSchema = z
  .object({
    id: z.string(),
    status: z.string().default('in_progress'),
    agent: z.string().optional(),
    outputs: z.array(geminiOutputSchema).default([]),
    error: providerErrorSchema.optional(),
  })
  .passthrough();

type GeminiInteraction = z.infer<typeof geminiInteractionSchema>;
type GeminiOutput = z.infer<typeof geminiOutputSchema>;

const sleep = async (
  ms: number,
  abortSignal: AbortSignal | undefined
): Promise<void> => {
  if (abortSignal?.aborted) {
    throw new DeepResearchError({
      code: 'ABORTED',
      message: 'Deep research wait was aborted',
    });
  }

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(
        new DeepResearchError({
          code: 'ABORTED',
          message: 'Deep research wait was aborted',
        })
      );
    };

    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
};

const isSupportedAgent = (agent: string): agent is GeminiDeepResearchAgentId =>
  SUPPORTED_GEMINI_DEEP_RESEARCH_AGENT_IDS.includes(
    agent as GeminiDeepResearchAgentId
  );

const toGeminiInputPart = (part: DeepResearchInputPart): GeminiInputPart => {
  if (part.type === 'text') {
    return {
      type: 'text',
      text: part.text,
    };
  }

  if (part.type === 'image') {
    const image = part as DeepResearchImageInputPart;
    return {
      type: 'image',
      uri: image.uri,
      ...(image.mimeType ? { mime_type: image.mimeType } : {}),
    };
  }

  const document = part as DeepResearchDocumentInputPart;
  return {
    type: 'document',
    uri: document.uri,
    mime_type: document.mimeType,
  };
};

const toGeminiInput = (
  input: DeepResearchInput
): string | GeminiInputPart[] => {
  if (typeof input === 'string') {
    return input;
  }

  return input.map(toGeminiInputPart);
};

const toGeminiTool = (tool: DeepResearchTool): GeminiTool => {
  if (tool.type === 'mcp_server') {
    return {
      type: 'mcp_server',
      ...(tool.name ? { name: tool.name } : {}),
      ...(tool.url ? { url: tool.url } : {}),
      ...(tool.headers ? { headers: tool.headers } : {}),
      ...(tool.allowedTools ? { allowed_tools: tool.allowedTools } : {}),
    };
  }

  if (tool.type === 'file_search') {
    return {
      type: 'file_search',
      file_search_store_names: tool.fileSearchStoreNames,
    };
  }

  return tool;
};

const toProviderError = (
  error: GeminiInteraction['error']
): DeepResearchProviderError | undefined => {
  if (!error) {
    return;
  }

  return {
    ...(error.code ? { code: error.code } : {}),
    message: error.message ?? 'Gemini Deep Research failed',
    ...(error.details ? { details: error.details } : {}),
  };
};

const toProviderMetadata = (
  interaction: GeminiInteraction
): Record<string, unknown> => {
  const { id, status, agent, outputs, error, ...providerMeta } = interaction;
  return providerMeta;
};

const toProviderPartMetadata = (
  output: GeminiOutput
): Record<string, Record<string, unknown>> => ({
  gemini: output,
});

const toDataUrl = (data: string, mediaType: string): string =>
  data.startsWith('data:') ? data : `data:${mediaType};base64,${data}`;

const toSourcePart = (output: GeminiOutput): DeepResearchOutputPart | null => {
  const url = output.url ?? output.uri;
  if (url) {
    return {
      type: 'source-url',
      sourceId: output.id ?? url,
      url,
      ...(output.title ? { title: output.title } : {}),
      providerMetadata: toProviderPartMetadata(output),
    } as unknown as DeepResearchOutputPart;
  }

  if (output.id && output.title) {
    return {
      type: 'source-document',
      sourceId: output.id,
      mediaType: output.media_type ?? output.mime_type ?? 'text/plain',
      title: output.title,
      providerMetadata: toProviderPartMetadata(output),
    } as unknown as DeepResearchOutputPart;
  }

  return null;
};

const toOutputPart = (output: GeminiOutput): DeepResearchOutputPart => {
  if (output.type === 'text' && output.text !== undefined) {
    return {
      type: 'text',
      text: output.text,
      providerMetadata: toProviderPartMetadata(output),
    } as DeepResearchOutputPart;
  }

  if (output.type === 'image') {
    const mediaType =
      output.media_type ?? output.mime_type ?? 'application/octet-stream';
    const url =
      output.uri ?? output.url ?? toDataUrl(output.data ?? '', mediaType);

    return {
      type: 'file',
      mediaType,
      url,
      providerMetadata: toProviderPartMetadata(output),
    } as DeepResearchOutputPart;
  }

  if (output.type === 'thought_summary') {
    return {
      type: 'reasoning',
      text: output.text ?? output.content?.text ?? '',
      state: 'done',
      providerMetadata: toProviderPartMetadata(output),
    } as DeepResearchOutputPart;
  }

  if (
    output.type === 'source' ||
    output.type === 'source-url' ||
    output.type === 'source_url' ||
    output.type === 'source-document' ||
    output.type === 'source_document'
  ) {
    const sourcePart = toSourcePart(output);
    if (sourcePart) {
      return sourcePart;
    }
  }

  return {
    type: 'data-deep-research-output',
    id: output.id,
    data: output,
  } as DeepResearchOutputPart;
};

const getText = (parts: DeepResearchOutputPart[]): string | undefined => {
  const text = parts
    .flatMap((part) =>
      part.type === 'text' && typeof part.text === 'string' ? [part.text] : []
    )
    .join('');

  return text.length > 0 ? text : undefined;
};

const toMessage = (
  interaction: GeminiInteraction,
  provider: string
): DeepResearchMessage => {
  const parts = interaction.outputs.map(toOutputPart);
  const providerMetadata = toProviderMetadata(interaction);

  return {
    id: interaction.id,
    role: 'assistant',
    metadata: {
      interactionId: interaction.id,
      provider,
      status: interaction.status,
      ...(interaction.agent ? { agent: interaction.agent } : {}),
      ...(Object.keys(providerMetadata).length > 0 ? { providerMetadata } : {}),
    },
    parts,
  };
};

const toInteraction = (
  interaction: GeminiInteraction,
  provider: string
): DeepResearchInteraction => {
  const message = toMessage(interaction, provider);
  const providerMetadata = toProviderMetadata(interaction);

  return {
    id: interaction.id,
    status: interaction.status,
    provider,
    ...(interaction.agent ? { agent: interaction.agent } : {}),
    message,
    ...(getText(message.parts) ? { text: getText(message.parts) } : {}),
    ...(interaction.error ? { error: toProviderError(interaction.error) } : {}),
    providerMetadata,
  };
};

const isFailedStatus = (status: string): boolean =>
  status === 'failed' || status === 'cancelled';

const isWaitingStatus = (status: string): boolean =>
  status === 'in_progress' || status === 'queued' || status === 'running';

/**
 * Gemini Interactions API implementation for Deep Research preview agents.
 */
export class GeminiDeepResearchService extends AbstractDeepResearchService {
  readonly provider = 'gemini';

  private readonly apiKey: string;
  private readonly agent: GeminiDeepResearchAgentId;
  private readonly baseUrl: string;
  private readonly pollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(options: GeminiDeepResearchServiceOptions) {
    super();
    this.apiKey = options.apiKey;
    this.agent = options.agent ?? defaultAgent;
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/g, '');
    this.pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
    this.requestTimeoutMs = options.requestTimeoutMs ?? defaultRequestTimeoutMs;
    this.retries = options.retries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  override async startResearch(
    input: DeepResearchStartInput
  ): Promise<DeepResearchInteraction> {
    return await this.createInteraction(input);
  }

  override async getResearch(
    input: DeepResearchGetInput
  ): Promise<DeepResearchInteraction> {
    return await this.requestInteraction({
      path: `/interactions/${encodeURIComponent(input.id)}`,
      method: 'GET',
    });
  }

  override async waitForCompletion(
    input: DeepResearchWaitInput
  ): Promise<DeepResearchInteraction> {
    const startedAt = Date.now();
    const timeoutMs = input.timeoutMs;
    const pollIntervalMs = input.pollIntervalMs ?? this.pollIntervalMs;

    const poll = async (): Promise<DeepResearchInteraction> => {
      if (input.abortSignal?.aborted) {
        throw new DeepResearchError({
          code: 'ABORTED',
          message: 'Deep research wait was aborted',
          interactionId: input.id,
        });
      }

      const interaction = await this.getResearch({ id: input.id });

      if (interaction.status === 'completed') {
        return interaction;
      }

      if (isFailedStatus(interaction.status)) {
        throw new DeepResearchError({
          code: 'FAILED',
          message:
            interaction.error?.message ??
            `Deep research interaction ${input.id} ended with status ${interaction.status}`,
          interactionId: input.id,
          providerError: interaction.error,
        });
      }

      if (!isWaitingStatus(interaction.status)) {
        return interaction;
      }

      if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
        throw new DeepResearchError({
          code: 'TIMEOUT',
          message: `Deep research interaction ${input.id} did not complete within ${timeoutMs}ms`,
          interactionId: input.id,
        });
      }

      await sleep(pollIntervalMs, input.abortSignal);
      return await poll();
    };

    return await poll();
  }

  override async continueResearch(
    input: DeepResearchContinueInput
  ): Promise<DeepResearchInteraction> {
    return await this.createInteraction(input);
  }

  private async createInteraction(
    input: DeepResearchStartInput | DeepResearchContinueInput
  ): Promise<DeepResearchInteraction> {
    const agent = this.resolveAgent(input.agentMode);
    const body: Record<string, unknown> = {
      input: toGeminiInput(input.input),
      agent,
      background: true,
      store: true,
      ...input.providerOptions,
    };

    if (input.agentConfig) {
      body.agent_config = {
        type: 'deep-research',
        ...(input.agentConfig.thinkingSummaries
          ? { thinking_summaries: input.agentConfig.thinkingSummaries }
          : {}),
        ...(input.agentConfig.visualization
          ? { visualization: input.agentConfig.visualization }
          : {}),
        ...(input.agentConfig.collaborativePlanning !== undefined
          ? { collaborative_planning: input.agentConfig.collaborativePlanning }
          : {}),
      };
    }

    if (input.tools) {
      body.tools = input.tools.map(toGeminiTool);
    }

    if (input.previousInteractionId) {
      body.previous_interaction_id = input.previousInteractionId;
    }

    return await this.requestInteraction({
      path: '/interactions',
      method: 'POST',
      body,
    });
  }

  private resolveAgent(
    agentMode: DeepResearchStartInput['agentMode']
  ): GeminiDeepResearchAgentId {
    const agent =
      agentMode === 'max' ? 'deep-research-max-preview-04-2026' : this.agent;

    if (!isSupportedAgent(agent)) {
      throw new DeepResearchError({
        code: 'UNSUPPORTED_AGENT',
        message: `Unsupported Gemini Deep Research agent: ${agent}`,
      });
    }

    return agent;
  }

  private async requestInteraction(args: {
    path: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
  }): Promise<DeepResearchInteraction> {
    const url = `${this.baseUrl}${args.path}`;

    try {
      const { response, data } = await fetchExt({
        url,
        init: {
          method: args.method,
          headers: {
            'x-goog-api-key': this.apiKey,
          },
          ...(args.body ? { body: args.body } : {}),
        },
        expectJson: {
          schema: geminiInteractionSchema,
        },
        retries: this.retries,
        retryDelay: this.retryDelayMs,
        retryOnHttpStatuses: transientHttpStatuses,
        respectRetryAfter: true,
        throwOnHttpError: false,
        timeout: this.requestTimeoutMs,
      });

      if (!response.ok) {
        throw new DeepResearchError({
          code: 'PROVIDER_ERROR',
          message: `Gemini Deep Research request failed with HTTP ${response.status}`,
          interactionId: data.id,
          providerError: toProviderError(data.error),
        });
      }

      return toInteraction(data, this.provider);
    } catch (error) {
      if (error instanceof DeepResearchError) {
        throw error;
      }

      throw new DeepResearchError({
        code: 'PROVIDER_ERROR',
        message:
          error instanceof Error
            ? error.message
            : 'Gemini Deep Research request failed',
      });
    }
  }
}
