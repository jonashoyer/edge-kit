/**
 * Custom dedent implementation for prompt templated strings.
 * @credit https://github.com/dmnd/dedent
 */

import { fnv1a64B64 } from "../crypto-utils";

export type TplOptions = {
  escapeSpecialCharacters?: boolean;
  trimWhitespace?: boolean;
  omitFalsyValues?: boolean;
  hashFn?: (input: string) => string;
};

export type Tpl = {
  (literals: string): string;
  (strings: TemplateStringsArray, ...values: unknown[]): string;
  withOptions: CreateTpl;
  getHash: (promptedString: string) => string | undefined;
};

const hashSymbol = Symbol("hash");
const interpolationSymbol = Symbol("interpolation");
const interpolationValuesSymbol = Symbol("interpolation-values");

const DENT_REGEX = /^(\s+)\S+/;

export type CreateTpl = (options: TplOptions) => Tpl;

function getMinDent(lines: string[]) {
  let mindent: number | null = null;
  for (const line of lines) {
    const match = DENT_REGEX.exec(line);
    if (match) {
      const indent = match[1]?.length ?? 0;
      mindent = mindent === null ? indent : Math.min(mindent, indent);
    }
  }

  return mindent;
}

function applyDedenting(lines: string[], mindent: number) {
  return lines.map((line) =>
    line.startsWith(" ") || line.startsWith("\t") ? line.slice(mindent) : line
  );
}

function createTpl(options: TplOptions) {
  tplFn.withOptions = (newOptions: TplOptions): Tpl =>
    createTpl({ ...options, ...newOptions });

  tplFn.getHash = (tplStr: string) => {
    const str = tplStr as string &
      Record<typeof hashSymbol, string | undefined> &
      Record<typeof interpolationSymbol, string[]>;
    if (str[hashSymbol]) {
      return str[hashSymbol];
    }

    const hash = (options.hashFn ?? fnv1a64B64)(
      str[interpolationSymbol].join("_TPL$_")
    );
    str[hashSymbol] = hash;
    return hash;
  };

  return tplFn;

  function tplFn(literals: string): string;
  function tplFn(strings: TemplateStringsArray, ...values: unknown[]): string;
  function tplFn(strings: TemplateStringsArray | string, ...values: unknown[]) {
    const raw = typeof strings === "string" ? [strings] : strings.raw;
    const {
      escapeSpecialCharacters = Array.isArray(strings),
      trimWhitespace = true,
      omitFalsyValues = false,
    } = options;

    // Process raw template parts
    let processedParts = raw.map((part) => {
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
    const minDent = getMinDent(
      processedParts.flatMap((part) => part.split("\n"))
    );

    // Apply dedenting to each part
    if (minDent !== null) {
      processedParts = processedParts.map((part) =>
        applyDedenting(part.split("\n"), minDent).join("\n")
      );
    }

    // Apply whitespace trimming to parts
    if (trimWhitespace && processedParts.length > 0) {
      processedParts[0] = processedParts[0]?.trimStart() ?? "";
      processedParts[processedParts.length - 1] =
        processedParts.at(-1)?.trimEnd() ?? "";
    }

    // Handle escaped newlines in parts
    if (escapeSpecialCharacters) {
      processedParts = processedParts.map((part) => part.replace(/\\n/g, "\n"));
    }

    // Store the processed parts for hashing
    const processedPartsForHash = [...processedParts];

    // Now apply the values to get the final result
    const result = processedParts.reduce((acc, part, i) => {
      const value = i < values.length ? values[i] : "";
      return acc + part + (omitFalsyValues && !value ? "" : value);
    }, "");

    // Create the result string with the symbols attached
    // biome-ignore lint/style/useConsistentBuiltinInstantiation: We need a String instance to attach the symbols
    const resultStr = new String(result) as string & Record<symbol, unknown>;
    resultStr[interpolationSymbol] = processedPartsForHash;
    resultStr[interpolationValuesSymbol] = values;

    return resultStr;
  }
}

export const tpl: Tpl = createTpl({ hashFn: fnv1a64B64 });
export const tpls = (strings: TemplateStringsArray, ...values: unknown[]) =>
  tpl(strings, ...values).toString();
