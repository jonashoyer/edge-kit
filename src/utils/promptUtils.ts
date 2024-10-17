type ExtractVariables<T extends string> = T extends `${string}{{${infer Var}}}${infer Rest}`
  ? Var | ExtractVariables<Rest>
  : never;

type TemplateParams<T extends string> = {
  [K in ExtractVariables<T>]: string;
};

export function promptBuilder<T extends string>(
  template: T,
  params: TemplateParams<T>
): string {
  return template.replace(
    /{{(\w+)}}/g,
    (_, key) => params[key as keyof TemplateParams<T>] ?? '',
  );
}
