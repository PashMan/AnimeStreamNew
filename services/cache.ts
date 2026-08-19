
export const CACHE_PREFIX = 'as_cache_';

/**
 * Helper to safely check if an image is valid and not a placeholder
 */
const isRealImage = (img: any): boolean => {
  if (!img) return false;
  if (typeof img === 'string') {
    const trimmed = img.trim();
    if (!trimmed) return false;
    if (trimmed.includes('missing') || trimmed.includes('none.png')) return false;
    return true;
  }
  if (typeof img === 'object') {
    const src = img.original || img.preview || img.x96 || img.x48 || img.url || '';
    if (typeof src === 'string' && src) {
      return !src.includes('missing') && !src.includes('none.png');
    }
  }
  return false;
};

/**
 * Checks if a piece of data is non-empty and worth caching long term
 */
export const isValidCacheData = (data: any): boolean => {
  if (data === null || data === undefined) return false;
  
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return false;
    if (trimmed === 'Описание отсутствует' || trimmed === 'Без названия') return false;
    if (trimmed.includes('missing') || trimmed.includes('none.png')) return false;
    return true;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return false;
    return true;
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return false;
    
    // For Anime / Material objects specifically
    if ('id' in data || 'title' in data || 'name' in data || 'russian' in data) {
      const hasTitle = Boolean(data.title || data.name || data.russian);
      const hasDesc = typeof data.description === 'string' && data.description.trim().length > 0 && data.description !== 'Описание отсутствует';
      const hasGenres = Array.isArray(data.genres) && data.genres.length > 0;
      const hasImg = isRealImage(data.image);
      // Keep if it has at least a title or valid payload
      return hasTitle || hasDesc || hasGenres || hasImg;
    }

    return true;
  }

  return true;
};

export const getFromStorage = (key: string): any | null => {
  try {
    const item = localStorage.getItem(CACHE_PREFIX + key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (!parsed || !isValidCacheData(parsed.data)) {
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
};

export const saveToStorage = (key: string, data: any) => {
  if (!isValidCacheData(data)) {
    return;
  }

  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (e) {
    // If quota exceeded, do smart LRU eviction instead of clearing everything
    try {
      const items: { key: string; timestamp: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              items.push({ key: k, timestamp: parsed.timestamp || 0 });
            }
          } catch (_) {
            items.push({ key: k, timestamp: 0 });
          }
        }
      }
      items.sort((a, b) => a.timestamp - b.timestamp);
      // Remove oldest 30% of cache items to make room
      const countToRemove = Math.max(1, Math.floor(items.length * 0.3));
      for (let i = 0; i < countToRemove; i++) {
        localStorage.removeItem(items[i].key);
      }
      // Re-attempt saving
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (e2) {}
  }
};

