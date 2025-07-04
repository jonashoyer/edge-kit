import { ml } from "../utils/string-utils";


export type PromptTemplateParams<T extends string> = Record<ExtractVariables<T>, string>;

export type PromptComposerComponent = {
  data: any;
  converter: (data: any) => string;
};

type ExtractVariables<T extends string> = T extends `${string}{{${infer Var}}}${infer Rest}`
  ? Var | ExtractVariables<Rest>
  : never;

export class PromptComposer {
  private static replace<T extends string>(
    template: T,
    params: Record<ExtractVariables<T>, string>
  ): string {
    return ml([template]).replace(
      /{{(\w+)}}/g,
      (_, key) => params[key as keyof PromptTemplateParams<T>] ?? '',
    );
  }

  static build<T extends string>(
    template: T,
    params: PromptTemplateParams<T>
  ): string {
    return this.replace(template, params);
  }

  static composer<T extends string, U extends Record<string, PromptComposerComponent>>(
    template: T,
    components: U,
    params: Record<Exclude<ExtractVariables<T>, keyof U>, string>
  ): string {
    const processedComponents: Record<string, string> = {};

    for (const [key, component] of Object.entries(components)) {
      const { data, converter } = component;
      processedComponents[key] = converter(data);
    }
    const mergedParams = { ...processedComponents, ...params } as unknown as Record<ExtractVariables<T>, string>;
    return this.replace(template, mergedParams as any);
  }

  /**
   * Converts an array to a list string.
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
  static arrayToList(arr: any[]): string {
    return arr.map(item => `- ${item}`).join('\n');
  }

  /**
   * Converts an object to a key-value string.
   * @param obj - The object to convert.
   * @returns The key-value string.
   * @example 
   * const obj = { name: 'John', age: 30 };
   * const result = PromptBuilder.objectToKeyValue(obj);
   * console.log(result);
   * // name: John
   * // age: 30
   */
  static objectToKeyValue(obj: Record<string, any>): string {
    return Object.entries(obj)
      .map(([key, value]) => `${key}: ${value}`)
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
  static jsonToXml(json: any, rootName: string = 'root'): string {
    const convert = (obj: any, name: string): string => {
      if (obj === null || obj === undefined) {
        return `<${name}/>`;
      }

      if (typeof obj !== 'object') {
        return `<${name}>${PromptComposer.escapeXml(obj.toString())}</${name}>`;
      }

      if (Array.isArray(obj)) {
        return obj.map(item => convert(item, name)).join('\n');
      }

      const children = Object.entries(obj)
        .map(([key, value]) => convert(value, key))
        .join('\n');

      return `<${name}>\n${PromptComposer.indent(children)}\n</${name}>`;
    };

    return convert(json, rootName);
  }

  private static indent(str: string): string {
    return str.split('\n').map(line => `  ${line}`).join('\n');
  }

  private static escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}


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