/** biome-ignore-all lint/suspicious/noBitwiseOperators: Adv random number generator */
/** biome-ignore-all lint/suspicious/noAssignInExpressions: Adv random number generator */
/** biome-ignore-all lint/style/noNonNullAssertion: Adv random number generator */
/** biome-ignore-all lint/style/noMagicNumbers: Adv random number generator */
/** biome-ignore-all lint/style/noParameterAssign: Adv random number generator */

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const MAX_INDEX = 6759; // 26*26*10 - 1

// Linear Congruential Generator (LCG) parameters for bijective mapping
// Verified: gcd(MULTIPLIER, MODULUS) = 1, ensuring bijection
const MODULUS = 6760; // Total range: 26 * 26 * 10
const MULTIPLIER = 2897; // Coprime with MODULUS for full-period mapping
const INCREMENT = 1729; // Offset (Ramanujan number)
const MULTIPLIER_INVERSE = 6753; // Modular multiplicative inverse of 2897 mod 6760

// Obfuscate index using LCG: (a*x + c) mod m
const obfuscateIndex = (index: number): number => {
  return (MULTIPLIER * index + INCREMENT) % MODULUS;
};

// Reverse obfuscation using modular inverse: a^-1 * (y - c) mod m
const deobfuscateIndex = (obfuscated: number): number => {
  return (
    (MULTIPLIER_INVERSE * (obfuscated - INCREMENT + MODULUS * 1000)) % MODULUS
  );
};

/**
 * Converts an index to a reference ID using LCG for obfuscation.
 * Guaranteed bijective - every index maps to exactly one unique ID.
 * Consecutive indices appear random.
 *
 * @param index - Index in range [0, 6759]
 * @returns 3-character reference ID (e.g., "AB5")
 */
export const getIndexReferenceId = (index: number): string => {
  if (index < 0 || index > MAX_INDEX) {
    throw new Error(`Index ${index} out of range [0, ${MAX_INDEX}]`);
  }

  const obfuscated = obfuscateIndex(index);

  const lastDigit = obfuscated % 10;
  const base26Value = Math.floor(obfuscated / 10);

  const firstCharIndex = Math.floor(base26Value / 26) % 26;
  const secondCharIndex = base26Value % 26;

  return `${chars[firstCharIndex]}${chars[secondCharIndex]}${lastDigit}`;
};

/**
 * Converts a reference ID back to its original index.
 *
 * @param refId - 3-character reference ID (e.g., "AB5")
 * @returns Original index in range [0, 6759]
 */
export const getIndexFromReferenceId = (refId: string): number => {
  if (refId.length !== 3) {
    throw new Error(`Invalid reference ID: ${refId}. Expected 3 characters.`);
  }

  const firstChar = refId[0]!.toUpperCase();
  const secondChar = refId[1]!.toUpperCase();
  const lastChar = refId[2]!;

  const firstCharIndex = chars.indexOf(firstChar);
  const secondCharIndex = chars.indexOf(secondChar);
  const lastDigit = Number(lastChar);

  if (
    firstCharIndex === -1 ||
    secondCharIndex === -1 ||
    Number.isNaN(lastDigit)
  ) {
    throw new Error(`Invalid reference ID format: ${refId}`);
  }

  const base26Value = firstCharIndex * 26 + secondCharIndex;
  const obfuscated = base26Value * 10 + lastDigit;

  return deobfuscateIndex(obfuscated);
};

/**
 * Converts an array of indices to reference IDs.
 *
 * @param indices - Array of indices in range [0, 6759]
 * @returns Array of 3-character reference IDs
 */
export const getIndexReferenceIds = (indices: number[]): string[] => {
  return indices.map((index) => getIndexReferenceId(index));
};

/**
 * Converts an array of reference IDs back to their original indices.
 *
 * @param refIds - Array of 3-character reference IDs
 * @returns Array of original indices in range [0, 6759]
 */
export const getIndicesFromReferenceIds = (refIds: string[]): number[] => {
  return refIds.map((refId) => getIndexFromReferenceId(refId));
};
