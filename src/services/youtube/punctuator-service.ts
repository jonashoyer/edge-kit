import type { TokenClassificationPipeline } from '@huggingface/transformers';

interface Prediction {
  word: string;
  entity: string;
  index: number;
}

interface Segment {
  text: string[];
  startIdx: number;
}

// https://huggingface.co/unikei/distilbert-base-re-punctuate
export class PunctuatorService {
  constructor(private pipeline: TokenClassificationPipeline) {}

  punctuateWordPiece(wordPiece: string, label: string): string {
    let processed = wordPiece;

    if (label.startsWith('UPPER')) {
      processed = processed.toUpperCase();
    } else if (label.startsWith('Upper')) {
      processed = processed[0]!.toUpperCase() + processed.slice(1);
    }

    if (!['_', wordPiece!.slice(-1)].includes(label!.slice(-1))) {
      processed += label!.slice(-1);
    }

    return processed;
  }

  punctuateSegment(predictions: Prediction[]): string {
    let result = '';

    for (let i = 0; i < predictions.length; i++) {
      const p = predictions[i]!;

      const wp = p.word.startsWith('##') ? p.word?.slice(2) : p.word;

      const processed = this.punctuateWordPiece(wp, p.entity);

      if (
        i > 0 &&
        result.length > 0 &&
        !p.word.startsWith('##') &&
        result.slice(-1) !== '-'
      ) {
        result += ' ';
      }

      result += processed;
    }
    return result;
  }

  async punctuate(text: string) {
    const processedText = text.toLowerCase().replace(/\n/g, ' ');

    const words = processedText.split(' ');

    const length = 150;
    const overlap = 0;

    // TODO: Add overlap support
    const segments = this.splitToSegments(words, length, overlap);
    const predictions = (await this.pipeline(
      segments.map((e) => e.text.join(' '))
    )) as Prediction[][];

    return {
      text: this.punctuateSegment(predictions.flat())
        .replace(/\s+/g, ' ')
        .replace(/\s'\s/g, "'")
        .trim(),
      predictions,
    };
  }

  punctuateSegments(texts: string[]) {
    return texts.reduce(async (pAcc, text) => {
      const acc = await pAcc;
      const predictions = await this.pipeline(text);
      return [
        ...acc,
        this.punctuateSegment(predictions.flat())
          .replace(/\s+/g, ' ')
          .replace(/\s'\s/g, "'")
          .trim(),
      ];
    }, Promise.resolve<string[]>([]));
  }

  private splitToSegments(
    words: string[],
    length: number,
    overlap: number
  ): Segment[] {
    return Array(Math.ceil(words.length / length))
      .fill(0)
      .map((_, i) => ({
        text: words.slice(i * length, (i + 1) * length + overlap),
        startIdx: i * length,
      }));
  }
}
