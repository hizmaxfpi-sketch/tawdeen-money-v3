// Centralized store for custom (user-added) business categories.
// Stored in localStorage. Provides add/update/delete + a subscription mechanism
// so any component using useCustomCategories() re-renders immediately when the
// list changes (no need to remount the form to see new entries).

import { useSyncExternalStore } from 'react';

export type CustomCategoryType = 'revenue' | 'expense';
export interface CustomCategory {
  value: string;
  label: string;
  type: CustomCategoryType;
}

const STORAGE_KEY = 'tawdeen_custom_categories';
const listeners = new Set<() => void>();

function readRaw(): CustomCategory[] {
  try {
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(arr)) return [];
    // de-dupe by value (last wins)
    const map = new Map<string, CustomCategory>();
    for (const c of arr) {
      if (c && typeof c.value === 'string') map.set(c.value, c);
    }
    return Array.from(map.values());
  } catch { return []; }
}

let _cache: CustomCategory[] = readRaw();

function writeRaw(next: CustomCategory[]) {
  _cache = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach(l => l());
}

export const customCategoriesStore = {
  getAll(): CustomCategory[] { return _cache; },

  add(cat: CustomCategory): boolean {
    if (_cache.find(c => c.value === cat.value)) return false;
    writeRaw([..._cache, cat]);
    return true;
  },

  update(value: string, patch: Partial<CustomCategory>): void {
    writeRaw(_cache.map(c => c.value === value ? { ...c, ...patch } : c));
  },

  remove(value: string): void {
    writeRaw(_cache.filter(c => c.value !== value));
  },

  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};

// Cross-tab sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      _cache = readRaw();
      listeners.forEach(l => l());
    }
  });
}

export function useCustomCategories(): CustomCategory[] {
  return useSyncExternalStore(
    customCategoriesStore.subscribe,
    customCategoriesStore.getAll,
    customCategoriesStore.getAll,
  );
}

export function makeCategoryValue(name: string): string {
  return 'custom_' + name.trim().replace(/\s+/g, '_').toLowerCase();
}
