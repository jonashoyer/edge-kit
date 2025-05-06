import { hashCodeB64 } from './crypto-utils';

/**
 * Creates a signature for API request protection against scraping/spam
 * @param key - Optional name of the function being called
 * @param timestamp - Current timestamp (defaults to now if not provided)
 * @param rotation - Shared secret between client and server
 * @returns A signature string that can be verified on the server
 */
export function createRequestSignature(
  key: string = 'default',
  rotation: string = ENCODING_ROTATION,
  timestamp: number = Date.now(),
) {
  const t = Math.floor(timestamp / 1000);
  const sig = hashCodeB64(`${key}:${t}:${rotation}`);
  return `${t.toString(36)}:${sig}`;
}

/**
 * Verifies a request signature to prevent API scraping/spam
 * @param signature - The signature to verify
 * @param key - Name of the function being called
 * @param rotation - Shared secret between client and server
 * @param maxDriftMs - Maximum allowed time drift in milliseconds (default: 5 minutes)
 * @returns True if the signature is valid and within allowed time drift
 */
export function verifyRequestSignature(
  signature: string,
  key: string = 'default',
  rotation: string = ENCODING_ROTATION,
  maxDriftMs: number = 3 * 60 * 1000
) {

  const [timestampSecB36] = signature.split(':');
  const timestamp = parseInt(timestampSecB36, 36) * 1000;

  // Check if the timestamp is within allowed drift (past or future)
  const now = Date.now();
  const drift = Math.abs(now - timestamp);
  if (drift > maxDriftMs) {
    return false;
  }

  const expectedSignature = createRequestSignature(
    key,
    rotation,
    timestamp,
  );

  return signature === expectedSignature;
}

export const ENCODING_ROTATION = 'base64url';
