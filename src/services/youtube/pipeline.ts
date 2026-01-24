import {
  pipeline,
  type TextGenerationPipeline,
} from "@huggingface/transformers";

/**
 * Singleton wrapper for HuggingFace Transformers pipelines.
 * Lazily initializes pipelines for text generation, fill-mask, and punctuation.
 * Ensures models are loaded only once.
 */
export class PipelineSingleton {
  pipeline: TextGenerationPipeline | null = null;

  static instance: PipelineSingleton | null = null;

  constructor() {
    if (!PipelineSingleton.instance) {
      PipelineSingleton.instance = this;
    }
    return PipelineSingleton.instance;
  }

  async getTextGenerationPipeline() {
    if (!this.pipeline) {
      // @ts-expect-error, pipeline function is not typed correctly
      this.pipeline = await pipeline(
        "text-generation",
        "HuggingFaceTB/SmolLM2-135M-Instruct"
      );
      // this.pipeline = await pipeline('text-generation', 'onnx-community/MobileLLM-125M', { dtype: 'fp32' });
    }
    return this.pipeline;
  }

  async getFillMaskPipeline() {
    const unmasker = await pipeline(
      "fill-mask",
      "Xenova/distilbert-base-uncased"
    );
    return unmasker;
  }

  // https://huggingface.co/unikei/distilbert-base-re-punctuate
  async getPunctuationPipeline() {
    const punctuator = await pipeline(
      "token-classification",
      "ldenoue/distilbert-base-re-punctuate"
    );
    return punctuator;
  }
}
