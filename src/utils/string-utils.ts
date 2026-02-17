export const ml = (strings: readonly string[], ...placeholders: any[]) => {
  const withSpace = strings.reduce((result, string, i) => {
    if (!placeholders[i - 1]) return result + string;
    return result + placeholders[i - 1] + string;
  });
  return withSpace
    .replace(/$\n^\s*/gm, (substring) =>
      substring.split('\n').fill('').join('\n')
    )
    .trim();
};

export const firstCharUpper = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);

export const convertSnakeCaseToReadable = (input: string) =>
  input
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// New function
export const camelToSnakeCase = (str: string): string => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

// New function
export const truncate = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
};
