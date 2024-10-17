export const ml = (strings: readonly string[], ...placeholders: any[]) => {
  const withSpace = strings.reduce((result, string, i) => {
    if (!placeholders[i - 1]) return result + string;
    return result + placeholders[i - 1] + string;
  });
  return withSpace.replace(/$\n^\s*/gm, substring => substring.split('\n').fill('').join('\n')).trim();
}

export function hashCode(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function hashCodeB64(str: string) {
  return toB64(hashCode(str));
}

export const firstCharUpper = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export const convertSnakeCaseToReadable = (input: string) =>
  input
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// New function
export const camelToSnakeCase = (str: string): string => {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// New function
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

const base64Digit = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
const toB64 = (x: number) => x.toString(2).split(/(?=(?:.{6})+(?!.))/g).map(v => base64Digit[parseInt(v, 2)]).join("")