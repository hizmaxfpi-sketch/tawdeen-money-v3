import { useState, useCallback } from 'react';

/**
 * Hook to persist filter state in sessionStorage.
 * Filters persist across page navigations but reset on tab close.
 */
export function usePersistedFilter<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `tawdeen-filter-${key}`;
  
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        // Handle Set reconstruction
        if (defaultValue instanceof Set) {
          return new Set(parsed) as unknown as T;
        }
        return parsed;
      }
    } catch {}
    return defaultValue;
  });

  const setPersistedValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolved = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
      try {
        // Handle Set serialization
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
