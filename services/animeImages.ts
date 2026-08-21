
import { getFromStorage, saveToStorage } from './cache';

const CACHE_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days long-term cache

const proxyImage = (url: string): string => {
  if (!url) return '';
  if (url.includes('shikimori.one')) {
    const path = url.split('shikimori.one')[1];
    return `/api/image${path}`;
  }
  if (url.startsWith('/')) {
    return `/api/image${url}`;
  }
  return url;
};

// In-flight promise tracker to avoid duplicate calls for same anime
const pendingRequests = new Map<string, Promise<string | null>>();

export const fetchAnimeImage = async (title: string, idMal?: string): Promise<string | null> => {
  if (!title && !idMal) return null;

  const cacheKey = idMal ? `anime_cover_id_${idMal}` : `anime_cover_${title}`;
  const cached = getFromStorage(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    const cleanTitle = title ? title.split('/')[0].trim() : '';

    // 1. Direct AniList lookup by ID (fastest & high-res)
    if (idMal) {
      const numId = parseInt(idMal, 10);
      if (!isNaN(numId)) {
        try {
          const anilistQuery = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large medium } } }`;
          const aRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: anilistQuery, variables: { idMal: numId } }),
            signal: AbortSignal.timeout(3000)
          });
          if (aRes.ok) {
            const aData = await aRes.json();
            const aImg = aData?.data?.Media?.coverImage?.extraLarge || aData?.data?.Media?.coverImage?.large;
            if (aImg) {
              saveToStorage(cacheKey, aImg);
              if (title) saveToStorage(`anime_cover_${title}`, aImg);
              return aImg;
            }
          }
        } catch (_) {}
      }
    }

    // 2. Direct AniList lookup by search title
    if (cleanTitle) {
      try {
        const anilistQuery = `query ($search: String) { Media(search: $search, type: ANIME) { coverImage { extraLarge large medium } } }`;
        const aRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query: anilistQuery, variables: { search: cleanTitle } }),
          signal: AbortSignal.timeout(3000)
        });
        if (aRes.ok) {
          const aData = await aRes.json();
          const aImg = aData?.data?.Media?.coverImage?.extraLarge || aData?.data?.Media?.coverImage?.large;
          if (aImg) {
            saveToStorage(cacheKey, aImg);
            if (idMal) saveToStorage(`anime_cover_id_${idMal}`, aImg);
            return aImg;
          }
        }
      } catch (_) {}
    }

// 3. Kitsu API lookup by title
    if (cleanTitle) {
      try {
        const kRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanTitle)}&page[limit]=1`, { signal: AbortSignal.timeout(2500) });
        if (kRes.ok) {
          const kData = await kRes.json();
          const first = kData?.data?.[0]?.attributes;
          const kImg = first?.posterImage?.large || first?.posterImage?.original || first?.posterImage?.medium;
          if (kImg) {
            saveToStorage(cacheKey, kImg);
            return kImg;
          }
        }
      } catch (_) {}
    }

    // 4. Fallback to Jikan
    if (idMal) {
      try {
        const jRes = await fetch(`https://api.jikan.moe/v4/anime/${idMal}`, { signal: AbortSignal.timeout(2500) });
        if (jRes.ok) {
          const jData = await jRes.json();
          const jImg = jData?.data?.images?.jpg?.large_image_url || jData?.data?.images?.jpg?.image_url;
          if (jImg) {
            saveToStorage(cacheKey, jImg);
            return jImg;
          }
        }
      } catch (_) {}
    }

    // 5. Shikimori system direct original URL
    if (idMal) {
      const shikiUrl = `https://shikimori.one/system/animes/original/${idMal}.jpg`;
      saveToStorage(cacheKey, shikiUrl);
      return shikiUrl;
    }

    return null;
  })();

  pendingRequests.set(cacheKey, promise);
  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(cacheKey);
  }
};

/**
 * Fetch maximum resolution widescreen banner image or 1080p screenshot for Hero section
 */
export const fetchHighResHeroBanner = async (title: string, idMal?: string, originalName?: string): Promise<string | null> => {
  if (!title && !idMal && !originalName) return null;

  const cacheKey = idMal ? `hero_banner_v3_${idMal}` : `hero_banner_v3_${title}`;
  const cached = getFromStorage(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const numId = idMal ? parseInt(idMal, 10) : NaN;

  // 1. Native Shikimori 1080p/720p Full HD Screenshots
  if (!isNaN(numId)) {
    try {
      const res = await fetch(`/api/shikimori/animes/${numId}/screenshots`, { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const firstShot = data[0]?.original || data[0]?.preview;
          if (firstShot) {
            let fullShot = firstShot;
            if (fullShot.startsWith('/')) {
              fullShot = `https://shikimori.one${fullShot}`;
            }
            const proxied = proxyImage(fullShot);
            saveToStorage(cacheKey, proxied);
            return proxied;
          }
        }
      }
    } catch (_) {}
  }

  // 2. AniList Widescreen bannerImage by idMal
  if (!isNaN(numId)) {
    try {
      const query = `query ($id: Int) {
        Media(idMal: $id, type: ANIME) {
          bannerImage
          coverImage { extraLarge large }
        }
      }`;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { id: numId } }),
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        const banner = data?.data?.Media?.bannerImage;
        if (banner) {
          saveToStorage(cacheKey, banner);
          return banner;
        }
      }
    } catch (_) {}
  }

  // 3. AniList Widescreen bannerImage by search title
  const searchTitles = [originalName, title].filter(Boolean).map(t => t!.split('/')[0].trim());
  for (const t of searchTitles) {
    if (!t) continue;
    try {
      const query = `query ($search: String) {
        Media(search: $search, type: ANIME) {
          bannerImage
          coverImage { extraLarge large }
        }
      }`;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { search: t } }),
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        const banner = data?.data?.Media?.bannerImage;
        if (banner) {
          saveToStorage(cacheKey, banner);
          return banner;
        }
      }
    } catch (_) {}
  }

  // 4. Kitsu 1920px Widescreen Cover Image
  for (const t of searchTitles) {
    if (!t) continue;
    try {
      const kRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(t)}&page[limit]=1`, { signal: AbortSignal.timeout(3000) });
      if (kRes.ok) {
        const kData = await kRes.json();
        const first = kData?.data?.[0]?.attributes;
        const kitsuBanner = first?.coverImage?.original || first?.coverImage?.large;
        if (kitsuBanner) {
          saveToStorage(cacheKey, kitsuBanner);
          return kitsuBanner;
        }
      }
    } catch (_) {}
  }

  // 5. AniList ExtraLarge High-Res Cover (1000x1500)
  if (!isNaN(numId)) {
    try {
      const query = `query ($id: Int) {
        Media(idMal: $id, type: ANIME) {
          coverImage { extraLarge large }
        }
      }`;
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { id: numId } }),
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        const cover = data?.data?.Media?.coverImage?.extraLarge || data?.data?.Media?.coverImage?.large;
        if (cover) {
          saveToStorage(cacheKey, cover);
          return cover;
        }
      }
    } catch (_) {}
  }

  return null;
};

