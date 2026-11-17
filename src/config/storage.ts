import { STORAGE_PREFIX } from './ids';

/**
 * Zugriff auf localStorage mit eigenem Präfix.
 * Alle Zugriffe sind abgesichert (privater Modus, gesperrter Speicher).
 */
export const storage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(STORAGE_PREFIX + key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(STORAGE_PREFIX + key, value);
    } catch {
      /* Speicher nicht verfügbar: still ignorieren */
    }
  },
  getJson<T>(key: string): T | null {
    const raw = storage.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJson(key: string, value: unknown): void {
    storage.set(key, JSON.stringify(value));
  },
};
