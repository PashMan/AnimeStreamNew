
export const CACHE_PREFIX = 'as_cache_';

export const getFromStorage = (key: string): any | null => {
  try {
    const item = localStorage.getItem(CACHE_PREFIX + key);
    if (!item) return null;
    return JSON.parse(item);
  } catch (e) {
    return null;
  }
};

export const saveToStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {
    // If quota exceeded, clear all cache
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(k);
        }
      }
    } catch (e2) {}
  }
};
