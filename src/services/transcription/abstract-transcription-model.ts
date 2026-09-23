import type {
  JSONObject,
  TranscriptionModelV3,
  TranscriptionModelV3CallOptions,
} from '@ai-sdk/provider';

/**
 * Normalized transcription segment with second-based timing.
 */
export interface LocalTranscriptionSegment {
  endSecond: number;
  startSecond: number;
  text: string;
}

/**
 * Runtime-level transcription result returned by local transcription workers.
 */
export interface LocalTranscriptionResult {
  durationInSeconds?: number;
  language?: string;
  providerMetadata?: Record<string, JSONObject>;
  segments: LocalTranscriptionSegment[];
  text: string;
}

/**
 * Request passed from an AI SDK transcription model to a local runtime.
 */
export interface LocalTranscriptionRequest {
  abortSignal?: AbortSignal;
  audioPath: string;
  modelId: string;
}

/**
 * Abstract contract for local transcription runtimes that operate on file paths.
 *
 * Example:
 * ```ts
 * const runtime = new MyRuntime();
 * const result = await runtime.transcribeFile({
 *   audioPath: '/tmp/audio.wav',
 *   modelId: 'my-model',
 * });
 * ```
 */
export abstract class AbstractLocalTranscriptionRuntime {
  abstract checkAvailability(): Promise<boolean>;

  abstract transcribeFile(
    request: LocalTranscriptionRequest
  ): Promise<LocalTranscriptionResult>;

  async dispose(): Promise<void> {}
}

/**
 * Base AI SDK transcription model contract for Edge Kit transcription services.
 */
export abstract class AbstractAiSdkTranscriptionModel
  implements TranscriptionModelV3
{
  readonly specificationVersion = 'v3' as const;

  abstract readonly provider: string;
  abstract readonly modelId: string;

  abstract doGenerate(
    options: TranscriptionModelV3CallOptions
  ): ReturnType<TranscriptionModelV3['doGenerate']>;
}
