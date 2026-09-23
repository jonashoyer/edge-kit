import { describe, expect, it, vi } from 'vitest';
import { PipelineSingleton } from './pipeline';

const { createPipeline } = vi.hoisted(() => ({
  createPipeline: vi.fn().mockResolvedValue({ model: 'test-model' }),
}));

vi.mock('@huggingface/transformers', () => ({ pipeline: createPipeline }));

describe('PipelineSingleton', () => {
  it('shares the owner and reuses the loaded text generation model', async () => {
    const first = new PipelineSingleton();
    const second = new PipelineSingleton();
    expect(second).toBe(first);
    const model = await first.getTextGenerationPipeline();
    expect(await second.getTextGenerationPipeline()).toBe(model);
    expect(createPipeline).toHaveBeenCalledTimes(1);
    expect(createPipeline).toHaveBeenCalledWith(
      'text-generation',
      'HuggingFaceTB/SmolLM2-135M-Instruct'
    );
  });
});
