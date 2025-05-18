/**
 * Custom dedent implementation for prompt templated strings.
 * @credit https://github.com/dmnd/dedent
 */

import { fnv1a64B64 } from "../utils/crypto-utils";

export interface TplOptions {
  escapeSpecialCharacters?: boolean;
  trimWhitespace?: boolean;
  hashFn?: (input: string) => string;
}

export interface Tpl {
  (literals: string): string;
  (strings: TemplateStringsArray, ...values: unknown[]): string;
  withOptions: CreateTpl;
  getHash: (promptedString: string) => string | undefined;
}

const hashSymbol = Symbol('hash');
const interpolationSymbol = Symbol('interpolation');
const interpolationValuesSymbol = Symbol('interpolation-values');

export type CreateTpl = (options: TplOptions) => Tpl;

function getMinDent(lines: string[]) {
  let mindent = null;
  for (const line of lines) {
    const match = /^(\s+)\S+/.exec(line);
    if (match) {
      const indent = match[1].length;
      mindent = mindent === null ? indent : Math.min(mindent, indent);
    }
  }

  return mindent;
}

function applyDedenting(lines: string[], mindent: number) {
  return lines.map(line => line.startsWith(" ") || line.startsWith("\t") ? line.slice(mindent) : line);
}

function createTpl(options: TplOptions) {
  tpl.withOptions = (newOptions: TplOptions): Tpl =>
    createTpl({ ...options, ...newOptions });

  tpl.getHash = (tplStr: string) => {
    const str = tplStr as string & Record<typeof hashSymbol, string | undefined> & Record<typeof interpolationSymbol, string[]>;
    if (str[hashSymbol]) {
      return str[hashSymbol];
    }

    const hash = (options.hashFn ?? fnv1a64B64)(str[interpolationSymbol].join('_TPL$_'));
    str[hashSymbol] = hash;
    return hash;
  }

  return tpl;

  function tpl(literals: string): string;
  function tpl(strings: TemplateStringsArray, ...values: unknown[]): string;
  function tpl(strings: TemplateStringsArray | string, ...values: unknown[]) {
    const raw = typeof strings === "string" ? [strings] : strings.raw;
    const {
      escapeSpecialCharacters = Array.isArray(strings),
      trimWhitespace = true,
    } = options;

    // Process raw template parts
    let processedParts = raw.map(part => {
      if (escapeSpecialCharacters) {
        return part
          .replace(/\\\n[ \t]*/g, "")
          .replace(/\\`/g, "`")
          .replace(/\\\$/g, "$")
          .replace(/\\\{/g, "{");
      }
      return part;
    });

    // Calculate minimum indentation for each part
    const minDent = getMinDent(processedParts.flatMap(part => part.split('\n')));

    // Apply dedenting to each part
    if (minDent !== null) {
      processedParts = processedParts.map(part =>
        applyDedenting(part.split('\n'), minDent).join('\n')
      );
    }

    // Apply whitespace trimming to parts
    if (trimWhitespace && processedParts.length > 0) {
      processedParts[0] = processedParts[0].trimStart();
      processedParts[processedParts.length - 1] = processedParts[processedParts.length - 1].trimEnd();
    }

    // Handle escaped newlines in parts
    if (escapeSpecialCharacters) {
      processedParts = processedParts.map(part => part.replace(/\\n/g, '\n'));
    }

    // Store the processed parts for hashing
    const processedPartsForHash = [...processedParts];

    // Now apply the values to get the final result
    const result = processedParts.reduce((acc, part, i) => {
      return acc + part + (i < values.length ? values[i] : '')
    }, '');

    // Create the result string with the symbols attached
    const resultStr = new String(result) as string & Record<symbol, any>;
    resultStr[interpolationSymbol] = processedPartsForHash;
    resultStr[interpolationValuesSymbol] = values;

    return resultStr;
  }
}

export const tpl: Tpl = createTpl({ hashFn: fnv1a64B64 });