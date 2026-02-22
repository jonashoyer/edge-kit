/** biome-ignore-all lint/suspicious/noExplicitAny: Part of the JSON.stringify API */

export type StringifyReplacer = (key: string, value: any) => any;
export type StringifyReviver = (key: string, value: any) => any;

function createReplacer(replacer?: StringifyReplacer): StringifyReplacer {
  return (key: string, value: unknown) => {
    if (typeof value === 'bigint') {
      return `${value.toString()}n`;
    }
    return replacer ? replacer(key, value) : value;
  };
}

const BIG_INT_REGEX = /^\d+n$/;

function createReviver(reviver?: StringifyReviver) {
  return (key: string, value: unknown) => {
    if (typeof value === 'string' && BIG_INT_REGEX.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return reviver ? reviver(key, value) : value;
  };
}

/**
 * Utility for stringifying and parsing JSON with support for BigInt.
 */
export const Stringify = {
  stringify: (
    obj: unknown,
    replacer?: StringifyReplacer,
    space?: string | number
  ) => JSON.stringify(obj, createReplacer(replacer), space),

  parse: (str: string, reviver?: StringifyReviver) =>
    JSON.parse(str, createReviver(reviver)),
};
