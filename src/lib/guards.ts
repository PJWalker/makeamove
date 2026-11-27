/** Whether a stored value is a T. */
export type Guard<T> = (value: unknown) => value is T;

/*
 * Checks for stored values, for `lww(guard)`: what a field must hold to be
 * read. Anything else reads as missing.
 */

export const isString: Guard<string> = (v): v is string => typeof v === "string";
export const isNumber: Guard<number> = (v): v is number =>
  typeof v === "number" && Number.isFinite(v);
export const isBoolean: Guard<boolean> = (v): v is boolean => typeof v === "boolean";

/** One of a fixed set of values. */
export const oneOf =
  <const T extends readonly (boolean | number | string)[]>(...values: T): Guard<T[number]> =>
  (v): v is T[number] =>
    values.includes(v as T[number]);

export const arrayOf =
  <T>(item: Guard<T>): Guard<T[]> =>
  (v): v is T[] =>
    Array.isArray(v) && v.every((value) => item(value));

/** A plain object (not an array or null); its fields are the reader's to check. */
export const isObject = <T extends object>(v: unknown, guard?: Guard<T>): v is T =>
  typeof v === "object" && v !== null && !Array.isArray(v) && (guard === undefined || guard(v));

/** Missing, or passing the guard. */
export const optional =
  <T>(is: Guard<T>): Guard<T | undefined> =>
  (v): v is T | undefined =>
    v === undefined || is(v);

type Guarded<S extends Record<string, Guard<unknown>>> = {
  [K in keyof S as undefined extends GuardOf<S[K]> ? K : never]?: GuardOf<S[K]>;
} & {
  [K in keyof S as undefined extends GuardOf<S[K]> ? never : K]: GuardOf<S[K]>;
};
type GuardOf<G> = G extends Guard<infer T> ? T : never;

/** A plain object whose fields each pass their guard; fields not named are allowed. */
export const objectOf =
  <S extends Record<string, Guard<unknown>>>(shape: S): Guard<Guarded<S>> =>
  (v): v is Guarded<S> =>
    isObject<Record<string, unknown>>(v) && Object.entries(shape).every(([k, is]) => is(v[k]));

/** No parameters: nothing, or an empty object. */
export const isNothing: Guard<void> = (v): v is void =>
  v === undefined || v === null || (isObject(v) && Object.keys(v).length === 0);
