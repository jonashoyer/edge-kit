/**
 * Utility functions for number manipulation.
 * Includes helpers for rounding, clamping, random integers, and currency formatting.
 */
export const round = (value: number, precision?: number) => {
  const multiplier = 10 ** (precision ?? 0);
  return Math.round(value * multiplier) / multiplier;
};

export const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(max, value));
};

export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const formatCurrency = (
  amount: number,
  currency = 'USD',
  locale = 'en-US'
): string => {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    amount
  );
};
