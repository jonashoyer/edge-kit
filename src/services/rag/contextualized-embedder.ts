import { fetchExt } from "../../utils/fetch-utils";

export type ContextualizedInputType = "document" | "query" | null;

export interface ContextualizedEmbedder {
  embed(
    inputs: string[][],
    inputType: ContextualizedInputType
  ): Promise<number[][]>;
}

export interface VoyageContextualizedEmbedderOptions {
  apiKey: string;
  model: string; // e.g. 'voyage-context-3'
  baseUrl?: string; // default: https://api.voyageai.com/v1
  outputDimension?: 256 | 512 | 1024 | 2048;
  outputDtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
}

const TRAILING_SLASH_REGEX = /\/$/;

/**
 * Interface and implementation for contextualized embeddings (e.g. Voyage AI).
 * Generates embeddings that are aware of the input type (document vs query) to improve retrieval quality.
 */
export class VoyageContextualizedEmbedder implements ContextualizedEmbedder {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly outputDimension?: 256 | 512 | 1024 | 2048;
  private readonly outputDtype?:
    | "float"
    | "int8"
    | "uint8"
    | "binary"
    | "ubinary";

  constructor(options: VoyageContextualizedEmbedderOptions) {
    this.baseUrl = (options.baseUrl ?? "https://api.voyageai.com/v1").replace(
      TRAILING_SLASH_REGEX,
      ""
    );
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.outputDimension = options.outputDimension;
    this.outputDtype = options.outputDtype;
  }

  async embed(
    inputs: string[][],
    inputType: ContextualizedInputType
  ): Promise<number[][]> {
    const body: any = {
      model: this.model,
      inputs,
    };
    if (inputType) body.input_type = inputType;
    if (this.outputDimension) body.output_dimension = this.outputDimension;
    if (this.outputDtype) body.output_dtype = this.outputDtype;

    const res = await fetchExt({
      url: `${this.baseUrl}/contextual_embeddings`,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      },
      retries: 2,
      timeout: 20_000,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Voyage contextualized embeddings failed: ${res.status} ${res.statusText} ${text}`
      );
    }

    const json = (await res.json()) as {
      results: Array<{ embeddings: number[][] }>;
    };

    return json.results.flatMap((r) => r.embeddings);
  }
}
