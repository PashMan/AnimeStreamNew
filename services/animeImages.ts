
import { getFromStorage, saveToStorage } from './cache';

const SHIKIMORI_API = '/api/shikimori/animes';
const CACHE_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days long-term cache

// Request queue
const queue: { title: string; resolve: (value: string | null) => void; reject: (reason?: any) => void }[] = [];
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
        const { title, resolve } = currentItem;
        
        // Check cache again
        const cached = getFromStorage(`anime_cover_${title}`);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            queue.shift();
            resolve(cached.data);
            continue;
        }

        try {
            const cleanTitle = title.split('/')[0].trim();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            // 1. First try relative Shikimori search through proxy
            const response = await fetch(`${SHIKIMORI_API}?search=${encodeURIComponent(cleanTitle)}&limit=1`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.status === 429) {
                console.warn('Shikimori Rate Limit (429) - Backing off');
                const retryAfter = response.headers.get('Retry-After');
                const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
                rateLimitResetTime = Date.now() + waitTime;
                continue; 
            }

            queue.shift(); // Remove from queue

            let imageUrl: string | null = null;

            if (response.ok) {
                const data = await response.json();
                if (Array.isArray(data) && data.length > 0 && data[0].image?.original) {
                    const orig = data[0].image.original;
                    if (!orig.includes('missing') && !orig.includes('none.png')) {
                        imageUrl = formatImageUrl(orig);
                    }
                }
            }

            // 2. Fallback to Kodik search if Shikimori has no valid image
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

            // 3. Fallback to AniList GraphQL by search title
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

            if (imageUrl) {
                saveToStorage(`anime_cover_${title}`, imageUrl);
            }
            resolve(imageUrl);

        } catch (e: any) {
            queue.shift(); // Remove failed item
            
            // Fallback directly to AniList / Kodik on Shikimori network failure
            try {
                const cleanTitle = title.split('/')[0].trim();
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
                        saveToStorage(`anime_cover_${title}`, aImg);
                        resolve(aImg);
                        continue;
                    }
                }
            } catch (_) {}

            resolve(null);
        }

        // Polite delay
        await new Promise(r => setTimeout(r, 400));
    }

    isProcessing = false;
};

export const fetchAnimeImage = (title: string): Promise<string | null> => {
    if (!title) return Promise.resolve(null);
    
    const cached = getFromStorage(`anime_cover_${title}`);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return Promise.resolve(cached.data);
    }

    return new Promise((resolve, reject) => {
        queue.push({ title, resolve, reject });
        processQueue();
    });
};
