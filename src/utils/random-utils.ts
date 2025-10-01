/** biome-ignore-all lint/suspicious/noBitwiseOperators: Adv random number generator */
/** biome-ignore-all lint/suspicious/noAssignInExpressions: Adv random number generator */
/** biome-ignore-all lint/style/noNonNullAssertion: Adv random number generator */
/** biome-ignore-all lint/style/noMagicNumbers: Adv random number generator */
/** biome-ignore-all lint/style/noParameterAssign: Adv random number generator */

export type RandomNumberGenerator = () => number;

export function seedRandomNumberGenerator(seedString: string) {
  // Create xmur3 state:
  const seed = xmur3(seedString);
  // Output four 32-bit hashes to provide the seed for sfc32.
  return sfc32(seed(), seed(), seed(), seed());
}

function xmur3(str: string) {
  let h = 1_779_033_703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3_432_918_353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2_246_822_507);
    h = Math.imul(h ^ (h >>> 13), 3_266_489_909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4_294_967_296;
  };
}

export const randomizeArray = <T>(
  array: T[],
  rand: RandomNumberGenerator
): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
};

export const pickRandom = <T>(array: T[], rand: RandomNumberGenerator): T => {
  return array[Math.floor(rand() * array.length)]!;
};
