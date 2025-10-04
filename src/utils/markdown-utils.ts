// ============================================================================
// Type Definitions
// ============================================================================

/**
 * How to format a field label in markdown
 */
export type FieldFormat = "bold" | "italic" | "code" | "plain";

/**
 * Output format for rendering
 */
export type OutputFormat = "markdown" | "xml";

/**
 * How to render arrays
 */
export type ArrayRenderMode = "inline" | "bulleted";

/**
 * Configuration for a single field
 */
export type FieldConfig<T = unknown> = {
  /** Display label for the field (defaults to field key) */
  label?: string;
  /** How to format the label */
  format?: FieldFormat;
  /** Override the schema-level output format for this field */
  outputFormat?: OutputFormat;
  /** Transform function to apply before rendering */
  transform?: (value: T) => unknown;
  /** How to render arrays (inline or bulleted) */
  arrayMode?: ArrayRenderMode;
  /** Nested schema for object values */
  fields?: T extends (infer U)[]
    ? U extends object
      ? MdSchemaConfig<U>
      : never
    : T extends object
      ? MdSchemaConfig<T>
      : never;
};

/**
 * Schema configuration mapping field names to their configs
 */
export type MdSchemaConfig<T> = {
  [K in keyof T]?: FieldConfig<T[K]>;
};

/**
 * Schema object with build methods
 */
export type MdSchema<T> = {
  readonly config: MdSchemaConfig<T>;
  build: (data: T | T[]) => string;
  buildXml: (data: T | T[], rootName?: string) => string;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a label according to the specified style
 */
function formatLabel(label: string, format: FieldFormat = "plain"): string {
  if (format === "bold") {
    return `**${label}**`;
  }
  if (format === "italic") {
    return `*${label}*`;
  }
  if (format === "code") {
    return `\`${label}\``;
  }
  return label;
}

/**
 * Convert a value to a string representation
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Check if a value should be omitted
 */
function shouldOmit(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string" && value.trim() === "") {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  // Only treat plain objects as empty objects
  if (
    typeof value === "object" &&
    value !== null &&
    (value as { constructor?: unknown }).constructor === Object &&
    Object.keys(value as Record<string, unknown>).length === 0
  ) {
    return true;
  }
  return false;
}

/**
 * Render an array value
 */
function renderArray(
  arr: unknown[],
  config: FieldConfig,
  _schemaConfig: MdSchemaConfig<unknown>,
  depth: number
): string {
  // Check if we have nested objects with a schema
  const hasNestedObjects =
    config.fields &&
    arr.some((item) => typeof item === "object" && item !== null);

  // Determine rendering mode
  // Default to inline unless explicitly bulleted
  let shouldRenderInline = config.arrayMode !== "bulleted";

  // If we have nested objects, always use bulleted format
  if (hasNestedObjects) {
    shouldRenderInline = false;
  }

  if (shouldRenderInline) {
    // Inline rendering: join with commas
    return arr.map((item) => formatValue(item)).join(", ");
  }

  // Bulleted rendering
  return arr
    .map((item) => {
      if (typeof item === "object" && item !== null && config.fields) {
        // Nested object in array
        const nested = renderObject(
          item as Record<string, unknown>,
          config.fields as MdSchemaConfig<Record<string, unknown>>,
          depth + 1
        );
        return `- ${nested.replace(/\n/g, "\n  ")}`;
      }
      return `- ${formatValue(item)}`;
    })
    .join("\n");
}

/**
 * Render an object value recursively
 */
function renderObject(
  obj: Record<string, unknown>,
  schemaConfig: MdSchemaConfig<Record<string, unknown>>,
  depth: number
): string {
  const fields: string[] = [];

  for (const [key, fieldConfig] of Object.entries(schemaConfig)) {
    const value = obj[key];

    // Check if we should omit this field
    if (shouldOmit(value)) {
      continue;
    }

    // Apply transform if present
    const transformedValue = fieldConfig?.transform
      ? fieldConfig.transform(value)
      : value;

    // Skip if transform returned undefined/null and omitIfEmpty
    if (shouldOmit(transformedValue)) {
      continue;
    }

    const rendered = renderFieldValue(
      transformedValue,
      fieldConfig ?? {},
      schemaConfig,
      depth
    );

    if (rendered === null) {
      continue;
    }

    // Format the label
    const label = fieldConfig?.label ?? key;
    const formattedLabel = formatLabel(label, fieldConfig?.format);

    fields.push(`${formattedLabel}: ${rendered}`);
  }

  return fields.join("\n");
}

/**
 * Render a single field value
 */
function renderFieldValue(
  value: unknown,
  config: FieldConfig,
  schemaConfig: MdSchemaConfig<unknown>,
  depth: number
): string | null {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return renderArray(value, config, schemaConfig, depth);
  }

  // Handle objects
  if (typeof value === "object" && config.fields) {
    const nested = renderObject(
      value as Record<string, unknown>,
      config.fields as MdSchemaConfig<Record<string, unknown>>,
      depth + 1
    );
    // Indent nested content
    return `\n${nested
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}`;
  }

  // Handle primitives
  return formatValue(value);
}

/**
 * Render a field's value specifically as markdown content (without the outer label)
 */
function renderFieldValueAsMarkdown(
  value: unknown,
  config: FieldConfig,
  schemaConfig: MdSchemaConfig<unknown>,
  depth: number
): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (Array.isArray(value)) {
    return renderArray(value, config, schemaConfig, depth);
  }
  if (typeof value === "object" && config.fields) {
    return renderObject(
      value as Record<string, unknown>,
      config.fields as MdSchemaConfig<Record<string, unknown>>,
      depth + 1
    );
  }
  return formatValue(value);
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
function jsonToXml(json: unknown, rootName = "root"): string {
  const convert = (obj: unknown, name: string): string => {
    if (obj === null || obj === undefined) {
      return `<${name}/>`;
    }

    if (typeof obj !== "object") {
      return `<${name}>${escapeXml(obj.toString())}</${name}>`;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => convert(item, name)).join("\n");
    }

    const children = Object.entries(obj)
      .map(([key, value]) => convert(value, key))
      .join("\n");

    return `<${name}>\n${indent(children)}\n</${name}>`;
  };

  return convert(json, rootName);
}

function indent(str: string): string {
  return str
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ============================================================================
// Core Build Functions
// ============================================================================

/**
 * Build markdown representation of data according to schema
 */
function mdBuild<T extends Record<string, unknown>>(
  data: T | T[],
  config: MdSchemaConfig<T>
): string {
  if (Array.isArray(data)) {
    return data
      .map((item) =>
        renderObject(
          item as Record<string, unknown>,
          config as MdSchemaConfig<Record<string, unknown>>,
          0
        )
      )
      .join("\n\n");
  }
  return renderObject(
    data,
    config as MdSchemaConfig<Record<string, unknown>>,
    0
  );
}

/**
 * Build XML representation of data according to schema
 */
function mdBuildXml<T extends Record<string, unknown>>(
  data: T | T[],
  config: MdSchemaConfig<T>,
  rootName = "root"
): string {
  if (Array.isArray(data)) {
    const transformed = data.map((item) =>
      transformDataForXml(
        item as unknown as Record<string, unknown>,
        config as unknown as MdSchemaConfig<Record<string, unknown>>
      )
    );
    return jsonToXml({ items: transformed }, rootName);
  }

  const transformed = transformDataForXml(
    data as unknown as Record<string, unknown>,
    config as unknown as MdSchemaConfig<Record<string, unknown>>
  );

  // Use PromptComposer's jsonToXml
  return jsonToXml(transformed, rootName);
}

/**
 * Transform data according to schema for XML output, honoring per-field outputFormat
 */
function transformDataForXml(
  obj: Record<string, unknown>,
  schema: MdSchemaConfig<Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, fc] of Object.entries(schema)) {
    const v = obj[k];
    if (shouldOmit(v)) {
      continue;
    }
    const tv = fc?.transform ? fc.transform(v) : v;
    if (shouldOmit(tv)) {
      continue;
    }

    const processed = processXmlValue(
      fc as FieldConfig | undefined,
      tv,
      schema as MdSchemaConfig<unknown>
    );
    if (processed === undefined) {
      continue;
    }
    out[k] = processed;
  }
  return out;
}

/**
 * Process a single field value for XML transformation, honoring outputFormat and nesting
 */
function processXmlValue(
  fc: FieldConfig | undefined,
  tv: unknown,
  schema: MdSchemaConfig<unknown>
): unknown | undefined {
  if (fc?.outputFormat === "markdown") {
    const md = renderFieldValueAsMarkdown(tv, fc, schema, 0);
    return md.trim() === "" ? undefined : md;
  }

  if (fc?.fields && typeof tv === "object" && tv !== null) {
    return transformDataForXml(
      tv as Record<string, unknown>,
      fc.fields as MdSchemaConfig<Record<string, unknown>>
    );
  }

  return tv;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a markdown schema for structured data rendering
 *
 * @example
 * ```ts
 * const userSchema = mdSchema<User>({
 *   name: { format: 'bold' },
 *   email: { format: 'code' },
 *   age: { label: 'Age (years)' },
 *   tags: { arrayMode: 'inline' },
 * });
 *
 * const markdown = userSchema.build({
 *   name: 'Alice',
 *   email: 'alice@example.com',
 *   age: 30,
 *   tags: ['developer', 'typescript', 'react']
 * });
 * ```
 */
export function mdSchema<T extends Record<string, unknown>>(
  config: MdSchemaConfig<T>
): MdSchema<T> {
  return {
    config,
    build: (data: T | T[]) => mdBuild(data, config),
    buildXml: (data: T | T[], rootName?: string) =>
      mdBuildXml(data, config, rootName),
  };
}

// ============================================================================
// Standalone Exports
// ============================================================================

/**
 * Build markdown from data and schema config (standalone function)
 */
export function buildMarkdown<T extends Record<string, unknown>>(
  data: T | T[],
  config: MdSchemaConfig<T>
): string {
  return mdBuild(data, config);
}

/**
 * Build XML from data and schema config (standalone function)
 */
export function buildXml<T extends Record<string, unknown>>(
  data: T | T[],
  config: MdSchemaConfig<T>,
  rootName = "root"
): string {
  return mdBuildXml(data, config, rootName);
}
