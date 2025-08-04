export function minBigInt(...values: bigint[]): bigint {
  if (values.length === 0) {
    throw new Error('Cannot find minimum of an empty array.');
  }
  let min = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] < min) {
      min = values[i];
    }
  }
  return min;
}

export function maxBigInt(...values: bigint[]): bigint {
  if (values.length === 0) {
    throw new Error('Cannot find maximum of an empty array.');
  }
  let max = values[0];
  for (let i = 1; i < values.length; i++) {
    if (values[i] > max) {
      max = values[i];
    }
  }
  return max;
}

export function multiplyBps(value: bigint, bps: number): bigint {
  return (value * BigInt(bps)) / 10000n;
}
