export const recursivelySortObject = <T>(obj: T): T => (
  obj === null || typeof obj !== 'object'
    ? obj
    : Array.isArray(obj)
      ? obj.map(recursivelySortObject)
      : Object.assign({},
        ...Object.entries(obj)
          .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
          .map(([k, v]) => ({ [k]: recursivelySortObject(v) }),
          ))
);

export const stableStringify = (obj: any) => JSON.stringify(recursivelySortObject(obj));