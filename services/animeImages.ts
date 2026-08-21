
import { getFromStorage, saveToStorage } from './cache';

const CACHE_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days long-term cache

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

    // 3. Fallback to Jikan
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
