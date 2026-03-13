import type { EncodeOptions } from '@toon-format/toon';
import { encode } from '@toon-format/toon';
import { ml } from '../utils/string-utils';

export type PromptTemplateParams<T extends string> = Record<
  ExtractVariables<T>,
  string
>;

export type PromptFormat = 'toon' | 'xml' | 'list' | 'keyValue';

export type PromptFormatOptions = {
  format?: PromptFormat;
  rootName?: string;
  toon?: EncodeOptions;
};

export type PromptComposerComponent = {
  data: unknown;
  converter: (data: unknown) => string;
};

type ExtractVariables<T extends string> =
  T extends `${string}{{${infer Var}}}${infer Rest}`
    ? Var | ExtractVariables<Rest>
    : never;

function replace<T extends string>(
  template: T,
  params: Record<ExtractVariables<T>, string>
): string {
  return ml([template]).replace(
    /{{(\w+)}}/g,
    (_, key) => params[key as keyof PromptTemplateParams<T>] ?? ''
  );
}

function build<T extends string>(
  template: T,
  params: PromptTemplateParams<T>
): string {
  return replace(template, params);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
  return String(value);
}

function composer<
  T extends string,
  U extends Record<string, PromptComposerComponent>,
>(
  template: T,
  components: U,
  params: Record<Exclude<ExtractVariables<T>, keyof U>, string>
): string {
  const processedComponents: Record<string, string> = {};

  for (const [key, component] of Object.entries(components)) {
    const { data, converter } = component;
    processedComponents[key] = converter(data);
  }
  const mergedParams = {
    ...processedComponents,
    ...params,
  } as unknown as Record<ExtractVariables<T>, string>;
  return replace(template, mergedParams);
}

/**
 * Formats structured prompt data for LLM input.
 * Defaults to TOON for compact, structured encoding.
 */
function format(data: unknown, options: PromptFormatOptions = {}): string {
  const { format = 'toon', rootName = 'root', toon } = options;

  if (format === 'toon') {
    return encode(data, toon);
  }

  if (format === 'xml') {
    return jsonToXml(data, rootName);
  }

  if (format === 'list') {
    if (!Array.isArray(data)) {
      throw new Error(
        'PromptComposer.format with format "list" requires an array input.'
      );
    }
    return arrayToList(data);
  }

  if (!isRecord(data)) {
    throw new Error(
      'PromptComposer.format with format "keyValue" requires an object input.'
    );
  }

  return objectToKeyValue(data);
}

/**
 * Legacy convenience helper for simple array rendering.
 * Prefer `PromptComposer.format(data)` for LLM-oriented payloads.
 *
 * @param arr - The array to convert.
 * @returns The list string.
 * @example
 * const arr = ['apple', 'banana', 'cherry'];
 * const result = PromptBuilder.arrayToList(arr);
 * console.log(result);
 * // - apple
 * // - banana
 * // - cherry
 */
function arrayToList(arr: unknown[]): string {
  return arr.map((item) => `- ${stringifyValue(item)}`).join('\n');
}

/**
 * Legacy convenience helper for flat object rendering.
 * Prefer `PromptComposer.format(data)` for LLM-oriented payloads.
 *
 * @param obj - The object to convert.
 * @returns The key-value string.
 * @example
 * const obj = { name: 'John', age: 30 };
 * const result = PromptBuilder.objectToKeyValue(obj);
 * console.log(result);
 * // name: John
 * // age: 30
 */
function objectToKeyValue(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([key, value]) => `${key}: ${stringifyValue(value)}`)
    .join('\n');
}

/**
 * Converts a JSON object to an XML string.
 * @param json - The JSON object to convert.
 * @param rootName - The name of the root element.
 * @returns The XML string.
 * @example
 * const json = { name: 'John', age: 30 };
 * const result = PromptBuilder.jsonToXml(json);
 * console.log(result);
 * // <root>
 * //   <name>John</name>
 * //   <age>30</age>
 * // </root>
 */
function jsonToXml(json: unknown, rootName = 'root'): string {
  const convert = (obj: unknown, name: string): string => {
    if (obj === null || obj === undefined) {
      return `<${name}/>`;
    }

    if (typeof obj !== 'object') {
      return `<${name}>${escapeXml(obj.toString())}</${name}>`;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => convert(item, name)).join('\n');
    }

    const children = Object.entries(obj)
      .map(([key, value]) => convert(value, key))
      .join('\n');

    return `<${name}>\n${indent(children)}\n</${name}>`;
  };

  return convert(json, rootName);
}

function indent(str: string): string {
  return str
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const PromptComposer = {
  build,
  composer,
  format,
  arrayToList,
  objectToKeyValue,
  jsonToXml,
} as const;

// const finalPrompt = PromptComposer.composer(
//   `
//   Hello {{name}}!

//   Today is {{today}}

//   Tasks:
//   {{tasks}}

//   Status:
//   {{status}}

//   Due date:
//   {{dueDate}}

//   User data:
//   {{xml}}
//   `,
//   {
//     today: {
//       data: new Date(),
//       converter: (date) => date.toLocaleDateString()
//     },
//     tasks: {
//       data: ["Buy groceries", "Walk the dog", "Finish report"],
//       converter: PromptComposer.arrayToList,
//     },
//     status: {
//       data: { ok: true, progress: "50%" },
//       converter: PromptComposer.objectToKeyValue
//     },
//     xml: {
//       data: {
//         name: "John",
//         age: 30,
//         isStudent: false
//       },
//       converter: (data) => PromptComposer.jsonToXml(data, 'user')
//     },
//   },
//   {
//     name: PromptComposer.build("{{firstName}} {{lastName}}", { firstName: "Alice", lastName: "Smith" }),
//     dueDate: PromptComposer.build("{{dayjs today}}", { today: new Date() }),
//   }
// );

// console.log('####\n' + finalPrompt + '\n####');
