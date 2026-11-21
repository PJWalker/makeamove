import type { Guard } from "../lib/guards";

export function getStorageItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStorageItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/**
 * The JSON saved under `key`, if it passes `is`. Anything else reads as
 * `fallback`, logged once per read and left as saved.
 */
export function getStorageJson<T>(key: string, is: Guard<T>, fallback: T): T;
export function getStorageJson<T>(key: string, is: Guard<T>, fallback: null): T | null;
export function getStorageJson<T>(key: string, is: Guard<T>, fallback: T | null): T | null {
  const saved = getStorageItem(key);
  if (saved === null) return fallback;
  let value: unknown;
  try {
    value = JSON.parse(saved);
  } catch {
    console.warn(`Ignoring saved ${key}: not JSON`, saved);
    return fallback;
  }
  if (is(value)) return value;
  console.warn(`Ignoring saved ${key}: not the expected kind of value`, value);
  return fallback;
}

export function setStorageJson(key: string, value: unknown): void {
  try {
    const saved = JSON.stringify(value);
    if (saved !== undefined) localStorage.setItem(key, saved);
  } catch {}
}
