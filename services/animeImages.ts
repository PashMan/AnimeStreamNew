
import { getFromStorage, saveToStorage } from './cache';

const SHIKIMORI_API = '/api/shikimori/animes';
const CACHE_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days long-term cache

// Request queue
const queue: { title: string; idMal?: string; resolve: (value: string | null) => void; reject: (reason?: any) => void }[] = [];
let isProcessing = false;
let rateLimitResetTime = 0;

const formatImageUrl = (url: string): string => {
  if (!url) return '';
  if (url.startsWith('/')) {
    return `/api/image${url}`;
  }
  if (url.includes('shikimori.one')) {
    const path = url.split('shikimori.one')[1];
    return `/api/image${path}`;
  }
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  return url;
};

const processQueue = async () => {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
        // Check rate limit
        const now = Date.now();
        if (now < rateLimitResetTime) {
            const waitTime = rateLimitResetTime - now;
            await new Promise(r => setTimeout(r, waitTime));
        }

        const currentItem = queue[0]; // Peek
        const { title, idMal, resolve } = currentItem;
        const cacheKey = idMal ? `anime_cover_id_${idMal}` : `anime_cover_${title}`;
        
        // Check cache again
        const cached = getFromStorage(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            queue.shift();
            resolve(cached.data);
            continue;
        }

        try {
            const cleanTitle = title.split('/')[0].trim();
            let imageUrl: string | null = null;

            // 1. If idMal is available, try AniList by ID first (fastest and most accurate)
            if (idMal) {
              const numId = parseInt(idMal, 10);
              if (!isNaN(numId)) {
                try {
                  const anilistQuery = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large medium } } }`;
                  const aRes = await fetch('https://graphql.anilist.co', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ query: anilistQuery, variables: { idMal: numId } })
                  });
                  if (aRes.ok) {
                    const aData = await aRes.json();
                    const aImg = aData?.data?.Media?.coverImage?.extraLarge || aData?.data?.Media?.coverImage?.large;
                    if (aImg) imageUrl = aImg;
                  }
                } catch (_) {}
              }
            }

            // 2. Try relative Shikimori search through proxy if not found
            if (!imageUrl) {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 6000);

              try {
                const response = await fetch(`${SHIKIMORI_API}?search=${encodeURIComponent(cleanTitle)}&limit=1`, {
                  method: 'GET',
                  headers: { 'Accept': 'application/json' },
                  signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (response.status === 429) {
                  const retryAfter = response.headers.get('Retry-After');
                  const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 3000;
                  rateLimitResetTime = Date.now() + waitTime;
                } else if (response.ok) {
                  const data = await response.json();
                  if (Array.isArray(data) && data.length > 0 && data[0].image?.original) {
                    const orig = data[0].image.original;
                    if (!orig.includes('missing') && !orig.includes('none.png')) {
                      imageUrl = formatImageUrl(orig);
                    }
                  }
                }
              } catch (_) {
                clearTimeout(timeoutId);
              }
            }

            // 3. Fallback to Kodik search if still no valid image
            if (!imageUrl) {
                try {
                    const kRes = await fetch(`/api/media/search?title=${encodeURIComponent(cleanTitle)}`);
                    if (kRes.ok) {
                        const kData = await kRes.json();
                        const poster = kData?.results?.[0]?.material_data?.poster_url || kData?.results?.[0]?.material_data?.anime_photos?.[0];
                        if (poster) {
                            imageUrl = formatImageUrl(poster);
                        }
                    }
                } catch (_) {}
            }

            // 4. Fallback to AniList GraphQL by search title
            if (!imageUrl) {
                try {
                    const anilistQuery = `query ($search: String) { Media(search: $search, type: ANIME) { coverImage { extraLarge large medium } } }`;
                    const aRes = await fetch('https://graphql.anilist.co', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                        body: JSON.stringify({ query: anilistQuery, variables: { search: cleanTitle } })
                    });
                    if (aRes.ok) {
                        const aData = await aRes.json();
                        const aImg = aData?.data?.Media?.coverImage?.extraLarge || aData?.data?.Media?.coverImage?.large;
                        if (aImg) {
                            imageUrl = aImg;
                        }
                    }
                } catch (_) {}
            }

            queue.shift(); // Remove from queue

            if (imageUrl) {
                saveToStorage(cacheKey, imageUrl);
                if (idMal) saveToStorage(`anime_cover_${title}`, imageUrl);
            }
            resolve(imageUrl);

        } catch (e: any) {
            queue.shift(); // Remove failed item
            resolve(null);
        }

        // Delay between queue items
        await new Promise(r => setTimeout(r, 150));
    }

    isProcessing = false;
};

export const fetchAnimeImage = (title: string, idMal?: string): Promise<string | null> => {
    if (!title && !idMal) return Promise.resolve(null);
    
    const cacheKey = idMal ? `anime_cover_id_${idMal}` : `anime_cover_${title}`;
    const cached = getFromStorage(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return Promise.resolve(cached.data);
    }

    return new Promise((resolve, reject) => {
        queue.push({ title, idMal, resolve, reject });
        processQueue();
    });
};
