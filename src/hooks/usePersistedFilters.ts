import { useState, useCallback } from 'react';

/**
 * Hook to persist filter state in sessionStorage.
 * Filters persist across page navigations but reset on tab close.
 *
 * Defensive: validates that the persisted value matches the *shape* of defaultValue.
 * Mismatched/corrupted values are discarded (this prevents bugs like
 * a stale 'in' filter being read where the type is now Set, or a Set
 * being read where the type is now string).
 */
export function usePersistedFilter<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `tawdeen-filter-${key}`;

  const isShapeMatch = (parsed: unknown): boolean => {
    if (defaultValue instanceof Set) return Array.isArray(parsed);
    if (Array.isArray(defaultValue)) return Array.isArray(parsed);
    if (typeof defaultValue === 'string') return typeof parsed === 'string';
    if (typeof defaultValue === 'number') return typeof parsed === 'number';
    if (typeof defaultValue === 'boolean') return typeof parsed === 'boolean';
    if (defaultValue === null || defaultValue === undefined) return true;
    if (typeof defaultValue === 'object') return typeof parsed === 'object' && parsed !== null;
    return true;
  };

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored === null) return defaultValue;
      const parsed = JSON.parse(stored);
      if (!isShapeMatch(parsed)) {
        // Stale / wrong-shape value — clear it and use default
        sessionStorage.removeItem(storageKey);
        return defaultValue;
      }
      if (defaultValue instanceof Set) {
        return new Set(parsed) as unknown as T;
      }
      return parsed;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
      try {
        if (resolved instanceof Set) {
          sessionStorage.setItem(storageKey, JSON.stringify(Array.from(resolved)));
        } else {
          sessionStorage.setItem(storageKey, JSON.stringify(resolved));
        }
      } catch {}
      return resolved;
    });
  }, [storageKey]);

  const reset = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setValue(defaultValue);
  }, [storageKey, defaultValue]);

  return [value, setPersistedValue, reset];
}
