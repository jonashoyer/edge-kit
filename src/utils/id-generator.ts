import { customAlphabet } from "nanoid";

/**
 * Utility for generating unique IDs.
 * Uses `nanoid` with a custom alphabet (lowercase alphanumeric) and length (20).
 * Suitable for database IDs, API keys, and other unique identifiers.
 */
export const genId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 20);
