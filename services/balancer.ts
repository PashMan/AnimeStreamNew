import { fetchKodikData } from './kodik';
import { getFromStorage, saveToStorage } from './cache';
import { isBDRipAvailable } from './bdripCatalog';

export interface PlayerInfo {
  name: string;
  iframe: string | null;
  isCustom?: boolean;
  isBdrip?: boolean;
  badge?: string;
}

export interface KodikTranslation {
  id: number | string;
  title: string;
  type: string;
  iframe: string;
  episodes_count?: number;
  last_episode?: number;
  provider?: string;
  kodik_iframe?: string | null;
  kodik_episodes_count?: number;
  aniboom_iframe?: string | null;
  aniboom_episodes_count?: number;
  quality_label?: string;
  sources?: any[];
  is_native_4k?: boolean;
}

export interface BalancerData {
  players: PlayerInfo[];
  kodik_translations: KodikTranslation[];
}

export const fetchPlayersClientSide = async (shikimoriId: string, title: string, year: string): Promise<BalancerData> => {
  if (!shikimoriId) return { players: [], kodik_translations: [] };

  // Clear any outdated cache entries in browser storage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('as_cache_balancer_v') || k.startsWith('balancer_v')) && !k.includes('balancer_v22_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  }

  const cacheKey = `balancer_v25_${shikimoriId}`;
  const cached = getFromStorage(cacheKey);

  // TTL: 6 hours for balancer data
  const ttl = 6 * 60 * 60 * 1000;
  if (cached && (Date.now() - cached.timestamp < ttl)) {
    console.log(`[Balancer Service] Loaded from cache for ID ${shikimoriId}`);
    return cached.data;
  }

  try {
    const res = await fetch(`/api/balancer?title=${encodeURIComponent(title)}&year=${year}&shikimori_id=${shikimoriId}`);
    if (res.ok) {
      const data = await res.json();
      
      let playersList: PlayerInfo[] = [];
      let translationsList: KodikTranslation[] = data.kodik_translations || [];

      // Handle the new response format: { players: [], ids: {} }
      if (data && data.players && Array.isArray(data.players)) {
        if (data.ids) {
          console.log('[BALANCER] Anime IDs used for search:', data.ids);
        }
        playersList = data.players;
      } else if (Array.isArray(data)) {
        // Fallback for old format
         playersList = data;
      }

      // Filter out standalone Anilibria and Aniboom (Aniboom streams are extracted into voiceovers for KamiPlayer)
      playersList = playersList.filter(p => p.name !== 'Anilibria' && p.name !== 'Aniboom');

      // Check availability
      const hasKodik = playersList.some(p => p.name === 'Kodik' && p.iframe);
      const hasTranslations = translationsList.length > 0;
      const hasBDRip = isBDRipAvailable(shikimoriId);

      // Add standard KamiPlayer
      if (hasBDRip || hasKodik || hasTranslations) {
        if (!playersList.some(p => p.name === 'KamiPlayer')) {
          playersList.unshift({
            name: 'KamiPlayer',
            iframe: null,
            isCustom: true
          });
        }
      }

      // If BDRip is available from R2, add exclusive KamiBDRip at the top!
      if (hasBDRip) {
        if (!playersList.some(p => p.name === 'KamiBDRip')) {
          playersList.unshift({
            name: 'KamiBDRip',
            iframe: null,
            isCustom: true,
            isBdrip: true,
            badge: 'KamiBDRip'
          });
        }
      }

      const result: BalancerData = {
        players: playersList,
        kodik_translations: translationsList
      };

      saveToStorage(cacheKey, result);
      return result;
    } else {
      if (cached) {
        console.warn(`[Balancer Service] API failed, using stale balancer cache for ${shikimoriId}`);
        return cached.data;
      }
    }
  } catch (e) {
    console.error('Balancer fetch failed', e);
    if (cached) {
      console.warn(`[Balancer Service] Balancer request error, using stale cache for ${shikimoriId}`);
      return cached.data;
    }
  }
  return { players: [], kodik_translations: [] };
};
