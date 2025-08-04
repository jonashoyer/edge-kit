export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

export type ReadonlyArray<T> = readonly T[];

export type AsyncFunction<T = void> = () => Promise<T>;

export type VoidFunction = () => void;

export type StringRecord = Record<string, any>;

export type UnknownObject = Record<string, unknown>;

export type ArrayOrSingle<T> = T | T[];

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

export type NonEmptyArray<T> = [T, ...T[]];

export type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };
export type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U;

export type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends Array<any>
    ? `${Key}`
    : ObjectType[Key] extends object
      ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
      : `${Key}`;
}[keyof ObjectType & (string | number)];

export type PartiallyOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type NonNever<T> = Pick<T, { [K in keyof T]: T[K] extends never ? never : K }[keyof T]>;

export type StringValues<T> = {
  [K in keyof T]: T[K] extends string ? T[K] : never;
}[keyof T];

export type NumberValues<T> = {
  [K in keyof T]: T[K] extends number ? T[K] : never;
}[keyof T];

export type EnumAsUnion<T> = `${StringValues<T>}` | NumberValues<T>;

export type ExtractZod<Type, Path> = Path extends `${infer Step}.${infer Path}`
  ? Step extends keyof Type
    ? ExtractZod<Type[Step], Path>
    : never
  : Path extends keyof Type
    ? Type[Path]
    : never;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type UnionToOvlds<U> = UnionToIntersection<U extends any ? (f: U) => void : never>;

export type PopUnion<U> = UnionToOvlds<U> extends (a: infer A) => void ? A : never;

export type IsUnion<T> = [T] extends [UnionToIntersection<T>] ? false : true;

export type UnionToArray<T, A extends unknown[] = []> =
  IsUnion<T> extends true ? UnionToArray<Exclude<T, PopUnion<T>>, [PopUnion<T>, ...A]> : [T, ...A];

export function betterTypeof(data: unknown) {
  if (typeof data === 'number') {
    if (Number.isNaN(data)) return 'NaN';
    if (Number.isInteger(data)) return 'integer';
  }

  if (typeof data === 'object') {
    if (Array.isArray(data)) return 'array';
    if (data === null) return 'null';
    if (Object.getPrototypeOf(data) !== Object.prototype && data.constructor) {
      return data.constructor.name as string;
    }
  }

  return typeof data;
}
