import { arrayBufferToBase64Url } from './buffer-utils';

const dataToUint8Array = (data: string | ArrayBuffer): Uint8Array => {
  return typeof data === 'string'
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
};

const toBufferSource = (data: string | ArrayBuffer): ArrayBuffer => {
  const bytes = dataToUint8Array(data);
  return Uint8Array.from(bytes).buffer;
};

export async function sha256(
  data: string | ArrayBuffer,
  salt?: Uint8Array
): Promise<ArrayBuffer> {
  const value = dataToUint8Array(data);
  const buff = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array([...value, ...(salt ?? [])]).buffer
  );
  return buff;
}

export async function sha1(data: string | ArrayBuffer): Promise<ArrayBuffer> {
  return await crypto.subtle.digest('SHA-1', toBufferSource(data));
}

/**
 * Hashes data using SHA-256
 * @param data - The data to hash
 * @param salt - An optional salt to add to the data
 * @returns The hashed data as a Base64URL string
 */
export async function sha256Base64(
  data: string | ArrayBuffer,
  salt?: Uint8Array
): Promise<string> {
  const hashBuffer = await sha256(data, salt);
  return arrayBufferToBase64Url(hashBuffer);
}

const arrayBufferToHex = (buffer: ArrayBuffer): string => {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
};

const importHmacKey = async (
  secret: string,
  algorithm: 'SHA-1' | 'SHA-256'
) => {
  const secretBytes = new TextEncoder().encode(secret);
  return await crypto.subtle.importKey(
    'raw',
    secretBytes.buffer.slice(
      secretBytes.byteOffset,
      secretBytes.byteOffset + secretBytes.byteLength
    ),
    {
      name: 'HMAC',
      hash: algorithm,
    },
    false,
    ['sign']
  );
};

export async function hmacHex(
  data: string | ArrayBuffer,
  secret: string,
  algorithm: 'sha1' | 'sha256'
): Promise<string> {
  const normalizedAlgorithm = algorithm === 'sha1' ? 'SHA-1' : 'SHA-256';
  const key = await importHmacKey(secret, normalizedAlgorithm);
  const signature = await crypto.subtle.sign('HMAC', key, toBufferSource(data));
  return arrayBufferToHex(signature);
}

export const parseSignatureHeader = (
  value: string,
  prefix: string
): string | null => {
  if (!value.startsWith(prefix)) {
    return null;
  }

  return value.slice(prefix.length);
};

export const verifyHmacHex = async (input: {
  value: string;
  secret: string;
  algorithm: 'sha1' | 'sha256';
  expectedHex: string;
}): Promise<boolean> => {
  const signature = await hmacHex(input.value, input.secret, input.algorithm);
  return constantTimeEqual(signature, input.expectedHex);
};

/**
 * Hashes an IP address using SHA-256. Tip: a substring of 6 bytes is enough for a unique hash.
 * @param ip - The IP address to hash
 * @param salt - An optional salt to add to the IP address
 * @returns The hashed IP address as a Base64URL string
 */
export async function sha256IpBase64(
  ip: string,
  salt?: Uint8Array
): Promise<string> {
  const ipBytes = new Uint8Array(
    ip.split('.').map((e) => Number.parseInt(e, 10))
  );
  const hashBuffer = await sha256(ipBytes.buffer, salt);
  return arrayBufferToBase64Url(hashBuffer);
}

export function generateRandomBuffer(length = 16) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * @deprecated Use generateRandomBuffer instead
 */
export function generateSalt(length = 16): Uint8Array {
  return generateRandomBuffer(length);
}

/**
 * Compares two hashes in constant time
 * @param a - The first hash
 * @param b - The second hash
 * @returns True if the hashes are equal, false otherwise
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * djb2 hash function
 * @param str - The string to hash
 * @returns The hash code of the string
 */
export function hashCode(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

const base64Digit =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const toB64 = (x: number | bigint) =>
  x
    .toString(2)
    .split(/(?=(?:.{6})+(?!.))/g)
    .map((v) => base64Digit[Number.parseInt(v, 2)])
    .join('');
export function hashCodeB64(str: string) {
  return toB64(hashCode(str));
}

export function fnv1a64(str: string): bigint {
  // FNV-1a 64-bit constants
  const FNV_offset_basis_64 = 14695981039346656037n;
  const FNV_prime_64 = 1099511628211n;
  const MASK_64 = (1n << 64n) - 1n;

  let hash = FNV_offset_basis_64;

  // Encode the string to UTF-8 bytes
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  for (let i = 0; i < bytes.length; i++) {
    // XOR the hash with the current byte
    hash ^= BigInt(bytes[i]); // Use the byte value

    // Multiply by the FNV prime
    hash *= FNV_prime_64;

    // Apply the 64-bit mask
    hash &= MASK_64;
  }

  return hash;
}

export const fnv1a64B64 = (str: string) => toB64(fnv1a64(str));

/**
 * Compares two ArrayBuffers in constant time.
 */
export function constantTimeArrayBufferCompare(
  a: ArrayBuffer,
  b: ArrayBuffer
): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }

  const aView = new Uint8Array(a);
  const bView = new Uint8Array(b);
  let result = 0;

  for (let i = 0; i < a.byteLength; i++) {
    result |= aView[i] ^ bView[i];
  }

  return result === 0;
}
