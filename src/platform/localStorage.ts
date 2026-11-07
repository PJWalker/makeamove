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

export function getStorageJson<T>(key: string, fallback: T): T {
  const saved = getStorageItem(key);
  if (saved === null) return fallback;
  try {
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

export function setStorageJson(key: string, value: unknown): void {
  try {
    const saved = JSON.stringify(value);
    if (saved !== undefined) localStorage.setItem(key, saved);
  } catch {}
}
