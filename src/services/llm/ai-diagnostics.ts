import {
  JSONParseError,
  NoObjectGeneratedError,
  TypeValidationError,
} from 'ai';

export interface AiDiagnosticIssue {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

export interface AiDiagnostics {
  stage: string;
  errorType: string;
  summary: string;
  finishReason?: string;
  issues: AiDiagnosticIssue[];
  rawTextSnippet?: string;
  rawObjectPreview?: string;
}

const MAX_TEXT_SNIPPET_LENGTH = 2000;
const MAX_OBJECT_PREVIEW_LENGTH = 3000;
const IDENTIFIER_SEGMENT_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const clampText = (value: string | undefined, maxLength: number) => {
  if (!value) {
    return;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength)}...`;
};

const stringifySafe = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const pathToString = (path: unknown): string => {
  if (!Array.isArray(path) || path.length === 0) {
    return '$';
  }

  let output = '$';
  for (const segment of path) {
    if (typeof segment === 'number') {
      output += `[${segment}]`;
      continue;
    }

    if (typeof segment === 'string') {
      if (IDENTIFIER_SEGMENT_REGEX.test(segment)) {
        output += `.${segment}`;
      } else {
        output += `["${segment}"]`;
      }
    }
  }

  return output;
};

const toIssue = (value: unknown): AiDiagnosticIssue | null => {
  if (!isRecord(value)) {
    return null;
  }

  let message = 'Validation issue';
  if (typeof value.message === 'string') {
    message = value.message;
  } else if (typeof value.code === 'string') {
    message = value.code;
  }

  const issue: AiDiagnosticIssue = {
    path: pathToString(value.path),
    message,
  };

  if ('expected' in value && value.expected !== undefined) {
    issue.expected = String(value.expected);
  }

  if ('received' in value && value.received !== undefined) {
    issue.received = String(value.received);
  }

  return issue;
};

const getIssuesFromUnknown = (value: unknown): AiDiagnosticIssue[] => {
  if (!isRecord(value) || !Array.isArray(value.issues)) {
    return [];
  }

  return value.issues
    .map((issue) => toIssue(issue))
    .filter((issue): issue is AiDiagnosticIssue => issue !== null);
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Unknown error';
};

export class AiDiagnosticError extends Error {
  readonly diagnostics: AiDiagnostics;
  readonly cause?: unknown;

  constructor(args: { diagnostics: AiDiagnostics; cause?: unknown }) {
    super(args.diagnostics.summary);
    this.name = 'AiDiagnosticError';
    this.diagnostics = args.diagnostics;
    this.cause = args.cause;
  }
}

const getTypeValidationField = (error: TypeValidationError) => {
  const errorWithContext = error as TypeValidationError & {
    context?: { field?: string };
  };

  return errorWithContext.context?.field;
};

export const isAiDiagnosticError = (
  error: unknown
): error is AiDiagnosticError =>
  error instanceof AiDiagnosticError ||
  (isRecord(error) && error.name === 'AiDiagnosticError');

export const getAiDiagnostics = (error: unknown): AiDiagnostics | null => {
  let cursor: unknown = error;

  while (cursor) {
    if (isAiDiagnosticError(cursor)) {
      return cursor.diagnostics;
    }

    if (!(isRecord(cursor) && 'cause' in cursor)) {
      break;
    }

    cursor = cursor.cause;
  }

  return null;
};

const buildNoObjectGeneratedDiagnostics = (args: {
  diagnostics: AiDiagnostics;
  error: NoObjectGeneratedError;
  rawText?: string;
}) => {
  const { diagnostics, error, rawText } = args;
  diagnostics.errorType = error.name;
  diagnostics.finishReason = error.finishReason;
  diagnostics.rawTextSnippet = clampText(
    rawText ?? error.text,
    MAX_TEXT_SNIPPET_LENGTH
  );

  if (JSONParseError.isInstance(error.cause)) {
    diagnostics.issues.push({
      path: '$',
      message: error.cause.message,
    });
    return;
  }

  if (TypeValidationError.isInstance(error.cause)) {
    const field = getTypeValidationField(error.cause);
    diagnostics.issues.push({
      path: field ? `$.${field}` : '$',
      message: error.cause.message,
    });
    diagnostics.issues.push(...getIssuesFromUnknown(error.cause.cause));
    return;
  }

  if (error.cause instanceof Error) {
    diagnostics.issues.push({
      path: '$',
      message: error.cause.message,
    });
  }
};

const buildJsonParseDiagnostics = (args: {
  diagnostics: AiDiagnostics;
  error: JSONParseError;
  rawText?: string;
}) => {
  const { diagnostics, error, rawText } = args;
  diagnostics.errorType = error.name;
  diagnostics.rawTextSnippet = clampText(
    rawText ?? error.text,
    MAX_TEXT_SNIPPET_LENGTH
  );
  diagnostics.issues.push({
    path: '$',
    message: error.message,
  });
};

const buildTypeValidationDiagnostics = (args: {
  diagnostics: AiDiagnostics;
  error: TypeValidationError;
}) => {
  const { diagnostics, error } = args;
  const field = getTypeValidationField(error);
  diagnostics.errorType = error.name;
  diagnostics.issues.push({
    path: field ? `$.${field}` : '$',
    message: error.message,
  });
  diagnostics.issues.push(...getIssuesFromUnknown(error.cause));
};

const buildGenericDiagnostics = (args: {
  diagnostics: AiDiagnostics;
  error: unknown;
}) => {
  const { diagnostics, error } = args;
  diagnostics.issues.push({
    path: '$',
    message: getErrorMessage(error),
  });

  const cause =
    error instanceof Error
      ? (error as Error & { cause?: unknown }).cause
      : undefined;
  if (isRecord(cause)) {
    diagnostics.issues.push(...getIssuesFromUnknown(cause));
  }
};

export const buildAiDiagnosticsFromError = (args: {
  stage: string;
  error: unknown;
  summary: string;
  rawObject?: unknown;
  rawText?: string;
}): AiDiagnostics => {
  const { stage, error, summary, rawObject, rawText } = args;

  const diagnostics: AiDiagnostics = {
    stage,
    errorType:
      error instanceof Error && error.name ? error.name : 'UnknownAiError',
    summary,
    issues: [],
  };

  if (NoObjectGeneratedError.isInstance(error)) {
    buildNoObjectGeneratedDiagnostics({ diagnostics, error, rawText });
  } else if (JSONParseError.isInstance(error)) {
    buildJsonParseDiagnostics({ diagnostics, error, rawText });
  } else if (TypeValidationError.isInstance(error)) {
    buildTypeValidationDiagnostics({ diagnostics, error });
  } else {
    buildGenericDiagnostics({ diagnostics, error });
  }

  diagnostics.rawObjectPreview = clampText(
    rawObject === undefined ? undefined : stringifySafe(rawObject),
    MAX_OBJECT_PREVIEW_LENGTH
  );

  return diagnostics;
};
