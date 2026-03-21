import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { NoSuchModelError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

import { AbstractLocalTranscriptionRuntime } from './abstract-transcription-model';
import {
  createParakeetTranscriptionProvider,
  DEFAULT_PARAKEET_MODEL_ID,
  ParakeetLocalRuntime,
  type ParakeetLocalTranscriptionError,
  ParakeetLocalTranscriptionModel,
} from './parakeet-local-provider';

class FakeRuntime extends AbstractLocalTranscriptionRuntime {
  lastAudioPath?: string;
  lastModelId?: string;

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async transcribeFile(request: {
    abortSignal?: AbortSignal;
    audioPath: string;
    modelId: string;
  }) {
    this.lastAudioPath = request.audioPath;
    this.lastModelId = request.modelId;

    return {
      durationInSeconds: 1.2,
      language: 'en',
      providerMetadata: {
        parakeet: {
          segmentCount: 1,
        },
      },
      segments: [
        {
          endSecond: 1.2,
          startSecond: 0,
          text: 'Hello world',
        },
      ],
      text: 'Hello world',
    };
  }
}

describe('ParakeetLocalTranscriptionModel', () => {
  it('maps runtime output to the AI SDK transcription contract', async () => {
    const runtime = new FakeRuntime();
    const model = new ParakeetLocalTranscriptionModel(
      DEFAULT_PARAKEET_MODEL_ID,
      {
        runtime,
      }
    );

    const result = await model.doGenerate({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: 'audio/mp3',
      providerOptions: {
        parakeet: {
          language: 'da',
          prompt: 'Prefer product names',
        },
      },
    });

    expect(result.text).toBe('Hello world');
    expect(result.language).toBe('en');
    expect(result.durationInSeconds).toBe(1.2);
    expect(result.segments).toEqual([
      {
        endSecond: 1.2,
        startSecond: 0,
        text: 'Hello world',
      },
    ]);
    expect(result.warnings).toEqual([
      {
        details:
          'The local Parakeet runtime currently ignores forced language selection.',
        feature: 'language',
        type: 'unsupported',
      },
      {
        details:
          'The local Parakeet runtime currently ignores transcription prompt hints.',
        feature: 'prompt',
        type: 'unsupported',
      },
    ]);
    expect(result.response.modelId).toBe(DEFAULT_PARAKEET_MODEL_ID);
    expect(runtime.lastModelId).toBe(DEFAULT_PARAKEET_MODEL_ID);
    expect(runtime.lastAudioPath?.endsWith('.mp3')).toBe(true);
  });

  it('writes base64 audio to a temporary file before invoking the runtime', async () => {
    const runtime = new FakeRuntime();
    const model = new ParakeetLocalTranscriptionModel(
      DEFAULT_PARAKEET_MODEL_ID,
      {
        runtime,
      }
    );
    const payload = Buffer.from('edge-kit-audio');

    await model.doGenerate({
      audio: payload.toString('base64'),
      mediaType: 'audio/wav',
    });

    expect(runtime.lastAudioPath).toBeDefined();
    const audioPath = runtime.lastAudioPath;
    if (!audioPath) {
      throw new Error('Expected runtime audio path to be captured.');
    }

    const bytes = await readFile(audioPath).catch(() => null);
    expect(bytes).toBeNull();
  });
});

describe('Parakeet provider factory', () => {
  it('creates a default transcription model via transcription alias', () => {
    const provider = createParakeetTranscriptionProvider({
      runtime: new FakeRuntime(),
    });

    const model = provider.transcription();

    expect(model.modelId).toBe(DEFAULT_PARAKEET_MODEL_ID);
  });

  it('rejects unsupported model ids', () => {
    const provider = createParakeetTranscriptionProvider({
      runtime: new FakeRuntime(),
    });

    expect(() => provider.transcription('not-supported')).toThrowError(
      NoSuchModelError
    );
  });
});

describe('ParakeetLocalRuntime', () => {
  it('reports unavailable on non-macOS platforms', async () => {
    const runtime = new ParakeetLocalRuntime({
      dependencies: {
        platform: () => 'linux',
      },
    });

    await expect(runtime.checkAvailability()).resolves.toBe(false);
  });

  it('fails clearly on non-macOS transcription attempts', async () => {
    const runtime = new ParakeetLocalRuntime({
      dependencies: {
        platform: () => 'linux',
      },
    });

    await expect(
      runtime.transcribeFile({
        audioPath: path.join(process.cwd(), 'audio.wav'),
        modelId: DEFAULT_PARAKEET_MODEL_ID,
      })
    ).rejects.toMatchObject<Partial<ParakeetLocalTranscriptionError>>({
      code: 'UNSUPPORTED_PLATFORM',
    });
  });

  it('checks absolute launcher paths before probing them', async () => {
    const runtime = new ParakeetLocalRuntime({
      dependencies: {
        access: async (value) => {
          if (String(value).includes('missing-python')) {
            throw new Error('missing');
          }

          await access(value);
        },
        homeDirectory: () => '/tmp/missing-python-home',
        platform: () => 'darwin',
        spawn: () => {
          throw new Error(
            'spawn should not run when the absolute path is missing'
          );
        },
      },
      pythonExecutable: '/tmp/missing-python',
    });

    await expect(runtime.checkAvailability()).resolves.toBe(false);
  });
});
