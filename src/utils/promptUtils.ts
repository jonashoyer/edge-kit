import { ml } from "./stringUtils";

type ExtractVariables<T extends string> = T extends `${string}{{${infer Var}}}${infer Rest}`
  ? Var | ExtractVariables<Rest>
  : never;

type TemplateParams<T extends string> = {
  [K in ExtractVariables<T>]: string;
};

type PromptComponentTemplate<T extends string = string> = {
  template: T;
  params?: Partial<TemplateParams<T>>;
};

type PromptComponentData = {
  data: any;
  converter: (data: any) => string;
};

type PromptComponent<T extends string = string> = PromptComponentTemplate<T> | PromptComponentData;

type MetaPromptComponents = Record<string, PromptComponent>;

type ExtractAllVariables<T extends MetaPromptComponents> = {
  [K in keyof T]: T[K] extends PromptComponentTemplate<infer U> ? ExtractVariables<U> : never;
}[keyof T];

type ExtractComponentVariables<T extends MetaPromptComponents> = {
  [K in keyof T]: T[K] extends PromptComponentTemplate<infer U> ? ExtractVariables<U> : never;
}[keyof T];

type ComponentProvidedParams<T extends MetaPromptComponents> = {
  [K in keyof T]: T[K] extends PromptComponentTemplate ? keyof T[K]['params'] : never;
}[keyof T];

type MissingParams<T extends string, U extends MetaPromptComponents> =
  Omit<
    TemplateParams<T> & { [K in ExtractComponentVariables<U>]: string },
    keyof U | ComponentProvidedParams<U>
  >;

export class PromptBuilder {
  private static replace<T extends string>(
    template: T,
    params: TemplateParams<T>
  ): string {
    return ml([template]).replace(
      /{{(\w+)}}/g,
      (_, key) => params[key as keyof TemplateParams<T>] ?? '',
    );
  }

  static build<T extends string>(
    template: T,
    params: TemplateParams<T>
  ): string {
    return this.replace(template, params);
  }

  static composer<T extends string, U extends MetaPromptComponents>(
    template: T,
    components: U,
    params: MissingParams<T, U>
  ) {
    const processedComponents: Record<string, string> = {};

    for (const [key, component] of Object.entries(components)) {
      if ('template' in component) {
        const { template: subTemplate, params: componentParams = {} } = component;
        const mergedParams = { ...componentParams, ...params };
        processedComponents[key] = this.build(subTemplate, mergedParams as any);
      } else {
        const { data, converter } = component;
        processedComponents[key] = converter(data);
      }
    }

    const mergedParams = { ...processedComponents, ...params };
    return this.build(ml([template]), mergedParams as any);
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
        return `<${name}>${PromptBuilder.escapeXml(obj.toString())}</${name}>`;
      }

      if (Array.isArray(obj)) {
        return obj.map(item => convert(item, name)).join('\n');
      }

      const children = Object.entries(obj)
        .map(([key, value]) => convert(value, key))
        .join('\n');

      return `<${name}>\n${PromptBuilder.indent(children)}\n</${name}>`;
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


// const finalPrompt = PromptBuilder.composer(
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
//     name: {
//       template: "{{firstName}} {{lastName}}",
//       params: { firstName: "Alice" }
//     },
//     tasks: {
//       data: ["Buy groceries", "Walk the dog", "Finish report"],
//       converter: PromptBuilder.arrayToList,
//     },
//     status: {
//       data: { ok: true, progress: "50%" },
//       converter: PromptBuilder.objectToKeyValue
//     },
//     xml: {
//       data: {
//         name: "John",
//         age: 30,
//         isStudent: false
//       },
//       converter: (data) => PromptBuilder.jsonToXml(data, 'user')
//     }
//   } as const,
//   {
//     lastName: 'Smith',
//     dueDate: '01-01-2024',
//   }
// );

// console.log('####\n' + finalPrompt + '\n####');