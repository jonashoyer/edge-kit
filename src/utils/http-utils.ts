import type { IncomingMessage } from 'node:http';

export const normalizeHeaders = (
  headers: Headers | Record<string, string | string[] | undefined>
): Record<string, string> => {
  if (headers instanceof Headers) {
    const normalized: Record<string, string> = {};
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    normalized[key.toLowerCase()] = Array.isArray(value)
      ? value.join(',')
      : value;
  }

  return normalized;
};

export const readNodeRequestBody = async (
  request: IncomingMessage
): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8');
};
