import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import type {
  JSONObject,
  LanguageModelV3,
  RerankingModelV3,
  TranscriptionModelV3CallOptions,
} from '@ai-sdk/provider';
import {
  type EmbeddingModelV3,
  NoSuchModelError,
  type ProviderV3,
  type SharedV3Warning,
  type SpeechModelV3,
} from '@ai-sdk/provider';

import {
  AbstractAiSdkTranscriptionModel,
  AbstractLocalTranscriptionRuntime,
  type LocalTranscriptionRequest,
  type LocalTranscriptionResult,
  type LocalTranscriptionSegment,
} from './abstract-transcription-model';

const PROTOCOL_VERSION = '1';
const DEFAULT_PROVIDER_ID = 'parakeet';
const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_MODEL_LOAD_TIMEOUT_MS = 120_000;
const DEFAULT_BOOT_TIMEOUT_MS = 10_000;

export const SUPPORTED_PARAKEET_MODEL_IDS = [
  'mlx-community/parakeet-tdt-0.6b-v2',
  'mlx-community/parakeet-tdt-0.6b-v3',
] as const;

export type ParakeetModelId = (typeof SUPPORTED_PARAKEET_MODEL_IDS)[number];

export const DEFAULT_PARAKEET_MODEL_ID: ParakeetModelId =
  'mlx-community/parakeet-tdt-0.6b-v3';

type ParakeetProviderOptionsShape = {
  language?: string;
  prompt?: string;
};

type RuntimeResponse = {
  v?: string;
  id?: string;
  type?: string;
  ok: boolean;
  error?: string;
  text?: string;
  language?: string;
  duration_in_seconds?: number;
  durationInSeconds?: number;
  metrics?: JSONObject;
  segments?: RuntimeSegment[];
};

type RuntimeSegment = {
  text?: string;
  start?: number;
  end?: number;
};

type RuntimeRequest = {
  type: 'load' | 'transcribe_file' | 'ping' | 'quit';
  model?: string;
  audio_path?: string;
};

type InflightRequest = {
  abortHandler?: () => void;
  abortSignal?: AbortSignal;
  reject: (error: Error) => void;
  resolve: (response: RuntimeResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

type LauncherProbeResult = {
  executablePath: string;
  reason?: string;
};

type ParakeetRuntimeDependencies = {
  access: typeof access;
  homeDirectory: () => string;
  platform: () => NodeJS.Platform;
  spawn: typeof spawn;
};

type ParakeetModelDependencies = {
  mkdtemp: typeof mkdtemp;
  readFile: typeof readFile;
  removeDirectory: typeof rm;
  tempDirectory: () => string;
  writeFile: typeof writeFile;
};

export type ParakeetLocalTranscriptionErrorCode =
  | 'ABORTED'
  | 'IMPORT_FAILED'
  | 'INVALID_RESPONSE'
  | 'LAUNCHER_NOT_FOUND'
  | 'REQUEST_TIMEOUT'
  | 'RUNTIME_NOT_AVAILABLE'
  | 'TRANSCRIPTION_FAILED'
  | 'UNSUPPORTED_PLATFORM'
  | 'WORKER_FAILURE';

/**
 * Typed error for local Parakeet runtime failures.
 */
export class ParakeetLocalTranscriptionError extends Error {
  readonly code: ParakeetLocalTranscriptionErrorCode;

  constructor(code: ParakeetLocalTranscriptionErrorCode, message: string) {
    super(message);
    this.name = 'ParakeetLocalTranscriptionError';
    this.code = code;
  }
}

/**
 * Runtime options for the local Parakeet MLX worker.
 */
export interface ParakeetLocalRuntimeOptions {
  pythonExecutable?: string;
  requestTimeoutMs?: number;
}

/**
 * AI SDK provider options supported by the local Parakeet model.
 *
 * `language` and `prompt` are accepted for interoperability, but they are
 * currently surfaced as unsupported warnings because the local runtime does not
 * apply them yet.
 */
export interface ParakeetTranscriptionProviderOptions {
  parakeet?: ParakeetProviderOptionsShape;
}

/**
 * AI SDK transcription model backed by a local Parakeet MLX runtime.
 *
 * Example:
 * ```ts
 * import { experimental_transcribe as transcribe } from 'ai';
 * import { createParakeetTranscriptionProvider } from './parakeet-local-provider';
 *
 * const parakeet = createParakeetTranscriptionProvider();
 * const result = await transcribe({
 *   model: parakeet.transcription('mlx-community/parakeet-tdt-0.6b-v3'),
 *   audio,
 * });
 * ```
 */
export class ParakeetLocalTranscriptionModel extends AbstractAiSdkTranscriptionModel {
  readonly modelId: string;
  readonly provider: string;

  private readonly dependencies: ParakeetModelDependencies;
  private readonly runtime: AbstractLocalTranscriptionRuntime;

  constructor(
    modelId: string,
    options?: {
      providerId?: string;
      runtime?: AbstractLocalTranscriptionRuntime;
      dependencies?: Partial<ParakeetModelDependencies>;
    }
  ) {
    super();
    this.modelId = modelId;
    const providerId = options?.providerId ?? DEFAULT_PROVIDER_ID;
    this.provider = `${providerId}.transcription`;
    this.runtime = options?.runtime ?? new ParakeetLocalRuntime();
    this.dependencies = {
      mkdtemp,
      readFile,
      removeDirectory: rm,
      tempDirectory: tmpdir,
      writeFile,
      ...options?.dependencies,
    };
  }

  async doGenerate(options: TranscriptionModelV3CallOptions) {
    const warnings = getParakeetWarnings(options.providerOptions?.parakeet);
    const tempDir = await this.dependencies.mkdtemp(
      path.join(this.dependencies.tempDirectory(), 'edge-kit-parakeet-')
    );
    const audioPath = path.join(tempDir, buildAudioFileName(options.mediaType));

    try {
      await this.dependencies.writeFile(
        audioPath,
        asAudioBuffer(options.audio)
      );

      const transcript = await this.runtime.transcribeFile({
        abortSignal: options.abortSignal,
        audioPath,
        modelId: this.modelId,
      });

      return {
        durationInSeconds:
          transcript.durationInSeconds ??
          getDurationInSeconds(transcript.segments),
        language: transcript.language,
        providerMetadata: transcript.providerMetadata,
        request: undefined,
        response: {
          body: transcript.providerMetadata,
          modelId: this.modelId,
          timestamp: new Date(),
        },
        segments: transcript.segments,
        text: transcript.text,
        warnings,
      };
    } finally {
      await this.dependencies.removeDirectory(tempDir, {
        force: true,
        recursive: true,
      });
    }
  }
}

/**
 * Persistent local runtime that talks to a Python Parakeet MLX worker over
 * stdio. It is optimized for repeated transcriptions in one Node process.
 */
export class ParakeetLocalRuntime extends AbstractLocalTranscriptionRuntime {
  private buffer = '';
  private inflight?: InflightRequest;
  private loadedModel: string | null = null;
  private process: ChildProcessWithoutNullStreams | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly dependencies: ParakeetRuntimeDependencies;
  private readonly pythonExecutable?: string;
  private readonly requestTimeoutMs: number;
  private stderrTail = '';

  constructor(
    options?: ParakeetLocalRuntimeOptions & {
      dependencies?: Partial<ParakeetRuntimeDependencies>;
    }
  ) {
    super();
    this.dependencies = {
      access,
      homeDirectory: homedir,
      platform: () => process.platform,
      spawn,
      ...options?.dependencies,
    };
    this.pythonExecutable = options?.pythonExecutable;
    this.requestTimeoutMs =
      options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  async checkAvailability(): Promise<boolean> {
    if (this.dependencies.platform() !== 'darwin') {
      return false;
    }

    try {
      await this.resolvePythonExecutable();
      return true;
    } catch {
      return false;
    }
  }

  async transcribeFile(
    request: LocalTranscriptionRequest
  ): Promise<LocalTranscriptionResult> {
    if (this.dependencies.platform() !== 'darwin') {
      throw new ParakeetLocalTranscriptionError(
        'UNSUPPORTED_PLATFORM',
        'Local Parakeet MLX transcription is only supported on macOS (darwin).'
      );
    }

    return this.enqueue(async () => {
      await this.ensureProcess();
      await this.ensureModelLoaded(request.modelId, request.abortSignal);

      const response = await this.sendRequest(
        {
          audio_path: request.audioPath,
          type: 'transcribe_file',
        },
        this.requestTimeoutMs,
        request.abortSignal
      );

      if (!response.ok) {
        throw new ParakeetLocalTranscriptionError(
          'TRANSCRIPTION_FAILED',
          response.error ?? 'Parakeet runtime transcription failed.'
        );
      }

      const text = response.text?.trim();
      if (!text) {
        throw new ParakeetLocalTranscriptionError(
          'INVALID_RESPONSE',
          'Parakeet runtime returned an empty transcript.'
        );
      }

      const segments = normalizeSegments(response.segments ?? []);
      if (segments.length === 0) {
        throw new ParakeetLocalTranscriptionError(
          'INVALID_RESPONSE',
          'Parakeet runtime returned no transcript segments.'
        );
      }

      const durationInSeconds = getDurationFromResponse(response, segments);

      return {
        durationInSeconds,
        language:
          typeof response.language === 'string' ? response.language : undefined,
        providerMetadata: response.metrics
          ? {
              parakeet: response.metrics,
            }
          : undefined,
        segments,
        text,
      };
    });
  }

  override async dispose(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      await this.sendRequest({ type: 'quit' }, 1000);
    } catch {}

    this.shutdownProcess();
  }

  private async ensureProcess(): Promise<void> {
    if (this.process?.exitCode === null && !this.process.killed) {
      return;
    }

    const executablePath = await this.resolvePythonExecutable();
    const processHandle = this.dependencies.spawn(
      executablePath,
      ['-u', '-c', WORKER_SCRIPT],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    processHandle.stdout.on('data', (chunk: Buffer | string) => {
      this.consumeStdout(String(chunk));
    });

    processHandle.stderr.on('data', (chunk: Buffer | string) => {
      this.stderrTail += String(chunk);
      if (this.stderrTail.length > 4000) {
        this.stderrTail = this.stderrTail.slice(-4000);
      }
    });

    processHandle.on('error', (error) => {
      this.rejectInflight(
        new ParakeetLocalTranscriptionError(
          'WORKER_FAILURE',
          `Parakeet runtime process error: ${error.message}`
        )
      );
      this.resetProcessState();
    });

    processHandle.on('close', (code) => {
      this.rejectInflight(
        new ParakeetLocalTranscriptionError(
          'WORKER_FAILURE',
          code === 0
            ? 'Parakeet runtime exited cleanly.'
            : `Parakeet runtime exited with code ${code}: ${this.stderrTail || 'no stderr output'}.`
        )
      );
      this.resetProcessState();
    });

    this.process = processHandle;
    this.buffer = '';
    this.loadedModel = null;
    this.stderrTail = '';

    const handshake = await this.sendRequest(
      { type: 'ping' },
      DEFAULT_BOOT_TIMEOUT_MS
    );
    if (!handshake.ok) {
      this.shutdownProcess();
      throw new ParakeetLocalTranscriptionError(
        'RUNTIME_NOT_AVAILABLE',
        handshake.error ?? 'Parakeet runtime failed its bootstrap ping.'
      );
    }
  }

  private async ensureModelLoaded(
    modelId: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    if (this.loadedModel === modelId) {
      return;
    }

    const response = await this.sendRequest(
      {
        model: modelId,
        type: 'load',
      },
      DEFAULT_MODEL_LOAD_TIMEOUT_MS,
      abortSignal
    );

    if (!response.ok) {
      throw new ParakeetLocalTranscriptionError(
        'TRANSCRIPTION_FAILED',
        response.error ?? `Failed to load Parakeet model "${modelId}".`
      );
    }

    this.loadedModel = modelId;
  }

  private async sendRequest(
    payload: RuntimeRequest,
    timeoutMs: number,
    abortSignal?: AbortSignal
  ): Promise<RuntimeResponse> {
    if (!this.process?.stdin.writable) {
      throw new ParakeetLocalTranscriptionError(
        'RUNTIME_NOT_AVAILABLE',
        'Parakeet runtime worker is not available.'
      );
    }

    if (abortSignal?.aborted) {
      throw new ParakeetLocalTranscriptionError(
        'ABORTED',
        'Parakeet transcription request was aborted before it started.'
      );
    }

    if (this.inflight) {
      throw new ParakeetLocalTranscriptionError(
        'WORKER_FAILURE',
        'Parakeet runtime received overlapping requests.'
      );
    }

    const requestPayload = {
      ...payload,
      id: randomUUID(),
      v: PROTOCOL_VERSION,
    };

    return new Promise<RuntimeResponse>((resolve, reject) => {
      const abortHandler = () => {
        this.clearInflight();
        this.shutdownProcess();
        reject(
          new ParakeetLocalTranscriptionError(
            'ABORTED',
            'Parakeet transcription request was aborted.'
          )
        );
      };

      const timer = setTimeout(() => {
        this.clearInflight();
        this.shutdownProcess();
        reject(
          new ParakeetLocalTranscriptionError(
            'REQUEST_TIMEOUT',
            `Parakeet runtime request timed out after ${Math.floor(
              timeoutMs / 1000
            )} seconds.`
          )
        );
      }, timeoutMs);

      this.inflight = {
        abortHandler: abortSignal ? abortHandler : undefined,
        abortSignal,
        reject,
        resolve,
        timer,
      };

      if (abortSignal) {
        abortSignal.addEventListener('abort', abortHandler, {
          once: true,
        });
      }

      this.process?.stdin.write(
        `${JSON.stringify(requestPayload)}\n`,
        (error) => {
          if (!error) {
            return;
          }

          this.clearInflight();
          reject(
            new ParakeetLocalTranscriptionError(
              'WORKER_FAILURE',
              `Failed to write Parakeet runtime request: ${error.message}`
            )
          );
        }
      );
    });
  }

  private consumeStdout(chunk: string): void {
    this.buffer += chunk;

    while (true) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }

      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (!line) {
        continue;
      }

      let response: RuntimeResponse;
      try {
        response = JSON.parse(line) as RuntimeResponse;
      } catch (_error) {
        this.rejectInflight(
          new ParakeetLocalTranscriptionError(
            'INVALID_RESPONSE',
            `Parakeet runtime returned invalid JSON: ${line}`
          )
        );
        continue;
      }

      if (typeof response.ok !== 'boolean') {
        this.rejectInflight(
          new ParakeetLocalTranscriptionError(
            'INVALID_RESPONSE',
            `Parakeet runtime response is missing the "ok" flag: ${line}`
          )
        );
        continue;
      }

      if (!this.inflight) {
        continue;
      }

      const inflight = this.inflight;
      this.clearInflight();
      inflight.resolve(response);
    }
  }

  private async resolvePythonExecutable(): Promise<string> {
    const candidates = this.getPythonCandidates();
    const failureReasons: string[] = [];

    for (const candidate of candidates) {
      const availability = await this.probePythonExecutable(candidate);
      if (!availability.executablePath) {
        if (availability.reason) {
          failureReasons.push(availability.reason);
        }
        continue;
      }

      try {
        await this.verifyRuntimeImportSmoke(availability.executablePath);
        return availability.executablePath;
      } catch (error) {
        failureReasons.push(
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    throw new ParakeetLocalTranscriptionError(
      'LAUNCHER_NOT_FOUND',
      failureReasons.length > 0
        ? `Unable to locate a usable Python runtime with parakeet_mlx: ${failureReasons.join(' | ')}`
        : 'Unable to locate a usable Python runtime with parakeet_mlx.'
    );
  }

  private getPythonCandidates(): string[] {
    const candidates = [
      this.pythonExecutable,
      process.env.PARAKEET_PYTHON_EXECUTABLE,
      path.join(
        this.dependencies.homeDirectory(),
        '.local',
        'pipx',
        'venvs',
        'parakeet-mlx',
        'bin',
        'python'
      ),
      'python3',
      'python',
    ];

    return [
      ...new Set(candidates.filter((value) => typeof value === 'string')),
    ];
  }

  private async probePythonExecutable(
    executablePath: string
  ): Promise<LauncherProbeResult> {
    if (path.isAbsolute(executablePath)) {
      try {
        await this.dependencies.access(executablePath);
      } catch {
        return {
          reason: `missing executable at ${executablePath}`,
          executablePath: '',
        };
      }
    }

    return new Promise<LauncherProbeResult>((resolve) => {
      const processHandle = this.dependencies.spawn(
        executablePath,
        ['-c', LAUNCHER_PROBE_SCRIPT],
        {
          stdio: ['ignore', 'ignore', 'pipe'],
        }
      );

      let stderr = '';
      processHandle.stderr.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk);
      });

      processHandle.on('error', (error) => {
        resolve({
          reason: `failed to launch ${executablePath}: ${error.message}`,
          executablePath: '',
        });
      });

      processHandle.on('close', (code) => {
        if (code === 0) {
          resolve({ executablePath });
          return;
        }

        resolve({
          reason:
            stderr.trim().length > 0
              ? `${executablePath}: ${stderr.trim()}`
              : `${executablePath}: launcher probe exited with ${code}`,
          executablePath: '',
        });
      });
    });
  }

  private async verifyRuntimeImportSmoke(
    executablePath: string
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const processHandle = this.dependencies.spawn(
        executablePath,
        ['-c', IMPORT_SMOKE_SCRIPT],
        {
          stdio: ['ignore', 'ignore', 'pipe'],
        }
      );

      let stderr = '';
      processHandle.stderr.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk);
      });

      processHandle.on('error', (error) => {
        reject(
          new ParakeetLocalTranscriptionError(
            'IMPORT_FAILED',
            `Failed to launch ${executablePath}: ${error.message}`
          )
        );
      });

      processHandle.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new ParakeetLocalTranscriptionError(
            'IMPORT_FAILED',
            stderr.trim().length > 0
              ? `${executablePath}: ${stderr.trim()}`
              : `${executablePath}: import smoke probe exited with ${code}`
          )
        );
      });
    });
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private clearInflight(): void {
    if (!this.inflight) {
      return;
    }

    clearTimeout(this.inflight.timer);
    if (this.inflight.abortHandler && this.inflight.abortSignal) {
      this.inflight.abortSignal.removeEventListener(
        'abort',
        this.inflight.abortHandler
      );
    }
    this.inflight = undefined;
  }

  private rejectInflight(error: Error): void {
    if (!this.inflight) {
      return;
    }

    const inflight = this.inflight;
    this.clearInflight();
    inflight.reject(error);
  }

  private shutdownProcess(): void {
    if (!this.process) {
      return;
    }

    if (this.process.exitCode === null && !this.process.killed) {
      this.process.kill();
    }

    this.resetProcessState();
  }

  private resetProcessState(): void {
    this.buffer = '';
    this.loadedModel = null;
    this.process = null;
  }
}

export interface ParakeetTranscriptionProvider extends ProviderV3 {
  transcription(modelId?: string): ParakeetLocalTranscriptionModel;
  transcriptionModel(modelId?: string): ParakeetLocalTranscriptionModel;
}

/**
 * Configuration for building a local Parakeet AI SDK provider.
 */
export interface CreateParakeetTranscriptionProviderOptions {
  modelIds?: readonly string[];
  providerId?: string;
  runtime?: AbstractLocalTranscriptionRuntime;
  runtimeOptions?: ParakeetLocalRuntimeOptions;
}

/**
 * Creates a transcription-focused AI SDK provider that exposes local Parakeet
 * MLX models through `provider.transcription(...)`.
 */
export const createParakeetTranscriptionProvider = (
  options?: CreateParakeetTranscriptionProviderOptions
): ParakeetTranscriptionProvider => {
  const providerId = options?.providerId ?? DEFAULT_PROVIDER_ID;
  const runtime =
    options?.runtime ?? new ParakeetLocalRuntime(options?.runtimeOptions);
  const supportedModelIds = new Set(
    options?.modelIds ?? SUPPORTED_PARAKEET_MODEL_IDS
  );

  const createModel = (
    modelId: string = DEFAULT_PARAKEET_MODEL_ID
  ): ParakeetLocalTranscriptionModel => {
    if (!supportedModelIds.has(modelId)) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'transcriptionModel',
      });
    }

    return new ParakeetLocalTranscriptionModel(modelId, {
      providerId,
      runtime,
    });
  };

  const throwUnsupported = (modelType: NoSuchModelError['modelType']) => {
    throw new NoSuchModelError({
      modelId: providerId,
      modelType,
    });
  };

  return {
    embeddingModel(_modelId: string): EmbeddingModelV3 {
      return throwUnsupported('embeddingModel');
    },
    imageModel(_modelId: string) {
      return throwUnsupported('imageModel');
    },
    languageModel(_modelId: string): LanguageModelV3 {
      return throwUnsupported('languageModel');
    },
    rerankingModel(_modelId: string): RerankingModelV3 {
      return throwUnsupported('rerankingModel');
    },
    specificationVersion: 'v3',
    speechModel(_modelId: string): SpeechModelV3 {
      return throwUnsupported('speechModel');
    },
    transcription(modelId?: string): ParakeetLocalTranscriptionModel {
      return createModel(modelId);
    },
    transcriptionModel(modelId?: string): ParakeetLocalTranscriptionModel {
      return createModel(modelId);
    },
  };
};

/**
 * Default provider instance for local Parakeet MLX transcription.
 */
export const parakeet = createParakeetTranscriptionProvider();

const getParakeetWarnings = (
  options: ParakeetProviderOptionsShape | undefined
): SharedV3Warning[] => {
  const warnings: SharedV3Warning[] = [];

  if (options?.language) {
    warnings.push({
      details:
        'The local Parakeet runtime currently ignores forced language selection.',
      feature: 'language',
      type: 'unsupported',
    });
  }

  if (options?.prompt) {
    warnings.push({
      details:
        'The local Parakeet runtime currently ignores transcription prompt hints.',
      feature: 'prompt',
      type: 'unsupported',
    });
  }

  return warnings;
};

const asAudioBuffer = (audio: Uint8Array | string): Buffer => {
  if (typeof audio === 'string') {
    return Buffer.from(audio, 'base64');
  }

  return Buffer.from(audio);
};

const buildAudioFileName = (mediaType: string): string => {
  const extension = mediaTypeToExtension(mediaType);
  return `audio.${extension}`;
};

const mediaTypeToExtension = (mediaType: string): string => {
  const normalized = mediaType.trim().toLowerCase();

  switch (normalized) {
    case 'audio/aac':
      return 'aac';
    case 'audio/flac':
      return 'flac';
    case 'audio/mp3':
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/ogg':
    case 'audio/opus':
      return 'ogg';
    default:
      return 'wav';
  }
};

const normalizeSegments = (
  segments: RuntimeSegment[]
): LocalTranscriptionSegment[] => {
  return segments
    .filter(
      (segment) =>
        typeof segment.text === 'string' &&
        Number.isFinite(segment.start) &&
        Number.isFinite(segment.end) &&
        Number(segment.end) >= Number(segment.start)
    )
    .map((segment) => ({
      endSecond: Number(segment.end),
      startSecond: Number(segment.start),
      text: segment.text!.trim(),
    }))
    .filter((segment) => segment.text.length > 0)
    .sort((left, right) => left.startSecond - right.startSecond);
};

const getDurationInSeconds = (
  segments: LocalTranscriptionSegment[]
): number | undefined => {
  const lastSegment = segments.at(-1);
  return lastSegment?.endSecond;
};

const getDurationFromResponse = (
  response: RuntimeResponse,
  segments: LocalTranscriptionSegment[]
): number | undefined => {
  const duration = response.durationInSeconds ?? response.duration_in_seconds;
  if (
    typeof duration === 'number' &&
    Number.isFinite(duration) &&
    duration >= 0
  ) {
    return duration;
  }

  return getDurationInSeconds(segments);
};

const LAUNCHER_PROBE_SCRIPT =
  "import importlib.util,sys; spec = importlib.util.find_spec('parakeet_mlx');\nif spec is None:\n  sys.stderr.write('parakeet_mlx_not_found');\n  raise SystemExit(3)\nprint(sys.executable)";

const IMPORT_SMOKE_SCRIPT = 'import parakeet_mlx, mlx.core';

const WORKER_SCRIPT = String.raw`
import json
import sys
import uuid

PROTOCOL_VERSION = "1"

try:
    from mlx.core import bfloat16
    from parakeet_mlx import from_pretrained
except Exception as e:
    sys.stdout.write(json.dumps({
        "v": PROTOCOL_VERSION,
        "id": None,
        "type": "bootstrap",
        "ok": False,
        "error": f"import_failure: {e}",
    }) + "\n")
    sys.stdout.flush()
    sys.exit(0)

loaded_model = None
loaded_model_name = None


def send(payload):
    base = {"v": PROTOCOL_VERSION}
    base.update(payload)
    sys.stdout.write(json.dumps(base, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def to_dict(item):
    if isinstance(item, dict):
        return item

    if hasattr(item, "dict") and callable(getattr(item, "dict")):
        try:
            out = item.dict()
            if isinstance(out, dict):
                return out
        except Exception:
            pass

    if hasattr(item, "model_dump") and callable(getattr(item, "model_dump")):
        try:
            out = item.model_dump()
            if isinstance(out, dict):
                return out
        except Exception:
            pass

    if hasattr(item, "__dict__"):
        return dict(item.__dict__)

    return {}


def pick_value(source, keys):
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return None


def extract_text(result):
    if isinstance(result, dict):
        for key in ("text", "transcript", "full_text"):
            value = result.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    for attr in ("text", "transcript", "full_text"):
        value = getattr(result, attr, None)
        if isinstance(value, str) and value.strip():
            return value.strip()

    data = to_dict(result)
    for key in ("text", "transcript", "full_text"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def extract_segments(result):
    candidates = []

    def gather(container):
        if not container:
            return

        if isinstance(container, dict):
            for key in ("segments", "timestamps", "chunks", "utterances", "words"):
                value = container.get(key)
                if isinstance(value, list) and value:
                    candidates.append(value)
        else:
            for key in ("segments", "timestamps", "chunks", "utterances", "words"):
                value = getattr(container, key, None)
                if isinstance(value, list) and value:
                    candidates.append(value)

    gather(result)
    gather(to_dict(result))

    if not candidates:
        return []

    normalized = []
    for entry in candidates[0]:
        data = to_dict(entry)
        if not data:
            continue

        text = pick_value(data, ["text", "token", "word", "value", "transcript"])
        start = pick_value(data, ["start", "start_time", "from", "begin"])
        end = pick_value(data, ["end", "end_time", "to", "finish"])

        if text is None or start is None or end is None:
            continue

        try:
            start = float(start)
            end = float(end)
        except Exception:
            continue

        if end < start:
            continue

        text = str(text).strip()
        if not text:
            continue

        normalized.append({
            "text": text,
            "start": round(start, 3),
            "end": round(end, 3),
        })

    normalized.sort(key=lambda item: item["start"])
    return normalized


def fail_response(req, message):
    send({
        "id": req.get("id"),
        "type": req.get("type"),
        "ok": False,
        "error": message,
    })


for raw in sys.stdin:
    line = raw.strip()
    if not line:
        continue

    req_id = str(uuid.uuid4())
    req_type = None

    try:
        req = json.loads(line)
        if not isinstance(req, dict):
            raise ValueError("request must be an object")
        req_id = req.get("id") or req_id
        req_type = req.get("type")
    except Exception as e:
        send({
            "id": req_id,
            "type": req_type,
            "ok": False,
            "error": f"invalid_json: {e}",
        })
        continue

    if req_type == "load":
        model = req.get("model")
        if not model:
            fail_response(req, "missing_model")
            continue

        try:
            loaded_model = from_pretrained(model, dtype=bfloat16)
            loaded_model_name = model
            send({
                "id": req_id,
                "type": req_type,
                "ok": True,
                "metrics": {"model": loaded_model_name},
            })
        except Exception as e:
            loaded_model = None
            loaded_model_name = None
            fail_response(req, str(e))

    elif req_type == "transcribe_file":
        if loaded_model is None:
            fail_response(req, "model_not_loaded")
            continue

        audio_path = req.get("audio_path")
        if not audio_path:
            fail_response(req, "missing_audio_path")
            continue

        try:
            result = loaded_model.transcribe(audio_path, dtype=bfloat16)
            text = extract_text(result)
            segments = extract_segments(result)
            if not text:
                fail_response(req, "empty_transcript")
                continue

            if not segments:
                fail_response(req, "missing_segments")
                continue

            send({
                "id": req_id,
                "type": req_type,
                "ok": True,
                "text": text,
                "segments": segments,
                "metrics": {
                    "model": loaded_model_name,
                    "segment_count": len(segments),
                },
            })
        except Exception as e:
            fail_response(req, str(e))

    elif req_type == "ping":
        send({
            "id": req_id,
            "type": req_type,
            "ok": True,
            "metrics": {"model": loaded_model_name},
        })

    elif req_type == "quit":
        send({
            "id": req_id,
            "type": req_type,
            "ok": True,
        })
        break

    else:
        fail_response(req, f"unknown_request_type: {req_type}")
`;
