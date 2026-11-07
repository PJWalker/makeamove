export function toggleSetValue<T>(values: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(values);
  if (!next.delete(value)) next.add(value);
  return next;
}
