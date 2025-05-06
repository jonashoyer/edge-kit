export const arrayBufferToBase64Url = (buffer: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

export async function sha256(data: string | ArrayBuffer, salt?: Uint8Array): Promise<ArrayBuffer> {
  const buff = await crypto.subtle.digest("SHA-256", new Uint8Array([...dataToUint8Array(data), ...(salt ?? [])]));
  return buff;
}

const dataToUint8Array = (data: string | ArrayBuffer): Uint8Array => {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  } else {
    return new Uint8Array(data);
  }
}

/**
 * Hashes data using SHA-256
 * @param data - The data to hash
 * @param salt - An optional salt to add to the data
 * @returns The hashed data as a Base64URL string
 */
export async function sha256Base64(data: string | ArrayBuffer, salt?: Uint8Array): Promise<string> {
  const hashBuffer = await sha256(dataToUint8Array(data), salt);
  return arrayBufferToBase64Url(hashBuffer);
}


/**
 * Hashes an IP address using SHA-256. Tip: a substring of 6 bytes is enough for a unique hash.
 * @param ip - The IP address to hash
 * @param salt - An optional salt to add to the IP address
 * @returns The hashed IP address as a Base64URL string
 */
export async function sha256IpBase64(ip: string, salt?: Uint8Array): Promise<string> {
  const ipBytes = new Uint8Array(ip.split('.').map(e => parseInt(e, 10)));
  const hashBuffer = await sha256(ipBytes, salt);
  return arrayBufferToBase64Url(hashBuffer);
}

export function generateSalt(length: number = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
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

const base64Digit = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const toB64 = (x: number) => x.toString(2).split(/(?=(?:.{6})+(?!.))/g).map(v => base64Digit[parseInt(v, 2)]).join("")
export function hashCodeB64(str: string) {
  return toB64(hashCode(str));
}