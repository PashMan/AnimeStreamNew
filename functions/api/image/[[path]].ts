export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);

  // Handle CORS preflight requests
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const path = url.pathname.replace(/^\/api\/image/, '');
  const isExplicitlyMissing = path.includes('missing') || path.includes('none.png');

  // 1. Check Cloudflare Cache first
  const cache = (caches as any)?.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached && cached.ok) {
        const cachedResponse = new Response(cached.body, cached);
        cachedResponse.headers.set('X-Image-Cache', 'HIT');
        return cachedResponse;
      }
    } catch (_) {}
  }

  const headers = new Headers();
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  headers.set('Referer', 'https://shikimori.one/');
  headers.set('Accept', 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');

  // Helper to extract anime ID from path
  const animeIdMatch = path.match(/(?:animes|original|preview|x96|x48)\/(\d+)\.(?:jpg|png|webp|jpeg)/i) || 
                       path.match(/\/(\d+)\.(?:jpg|png|webp|jpeg)/i) || 
                       url.search.match(/id=(\d+)/);

  // 2. If not explicitly missing, try Shikimori CDN mirrors with 1800ms timeout
  if (!isExplicitlyMissing) {
    const mirrors = [
      `https://shikimori.one${path}${url.search}`,
      `https://shikimori.io${path}${url.search}`,
      `https://desu.shikimori.one${path}${url.search}`
    ];

    for (const mirrorUrl of mirrors) {
      try {
        const fetchResponse = await fetch(mirrorUrl, {
          method: 'GET',
          headers: headers,
          signal: AbortSignal.timeout(1800),
        });

        if (fetchResponse.ok && !fetchResponse.url.includes('missing') && !fetchResponse.url.includes('none.png')) {
          const newHeaders = new Headers(fetchResponse.headers);
          newHeaders.set('Access-Control-Allow-Origin', '*');
          newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
          newHeaders.delete('Content-Security-Policy');
          newHeaders.delete('X-Frame-Options');
          newHeaders.delete('Vary');
          newHeaders.delete('Set-Cookie');

          const res = new Response(fetchResponse.body, {
            status: 200,
            statusText: 'OK',
            headers: newHeaders,
          });

          if (cache && context.waitUntil) {
            context.waitUntil(cache.put(cacheKey, res.clone()));
          }
          return res;
        }

        // If 404 on Shikimori, don't waste time on other Shikimori mirrors, jump straight to AniList
        if (fetchResponse.status === 404) {
          break;
        }
      } catch (_) {}
    }
  }

  // 3. Fallback to AniList GraphQL, Kodik, and Jikan by anime ID
  if (animeIdMatch) {
    const animeId = parseInt(animeIdMatch[1], 10);

    // 3a. Try AniList GraphQL first (HD covers & banners)
    try {
      const anilistQuery = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large medium } bannerImage } }`;
      const aniRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: anilistQuery, variables: { idMal: animeId } }),
        signal: AbortSignal.timeout(3000)
      });
      if (aniRes.ok) {
        const aniData: any = await aniRes.json();
        const media = aniData?.data?.Media;
        // If path or query includes 'banner' or 'cover', prefer banner if available
        const isCoverOrBanner = path.includes('cover') || path.includes('original') || url.search.includes('type=cover');
        const imgUrl = (isCoverOrBanner && media?.bannerImage) ? media.bannerImage : (media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || media?.bannerImage);
        
        if (imgUrl) {
          const aniImgRes = await fetch(imgUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(3000) 
          });
          if (aniImgRes.ok) {
            const newHeaders = new Headers(aniImgRes.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
            newHeaders.set('Content-Type', aniImgRes.headers.get('content-type') || 'image/jpeg');
            const res = new Response(aniImgRes.body, { status: 200, headers: newHeaders });
            if (cache && context.waitUntil) {
              context.waitUntil(cache.put(cacheKey, res.clone()));
            }
            return res;
          }
        }
      }
    } catch (_) {}

    // 3b. Try Kodik search
    try {
      const kodikRes = await fetch(`https://kodikapi.com/search?token=e3189966144beaa4a54c600125c1109a&shikimori_id=${animeId}&with_material_data=true`, {
        signal: AbortSignal.timeout(2500)
      });
      if (kodikRes.ok) {
        const kData: any = await kodikRes.json();
        const poster = kData?.results?.[0]?.material_data?.poster_url || kData?.results?.[0]?.material_data?.anime_photos?.[0];
        if (poster) {
          const pUrl = poster.startsWith('//') ? `https:${poster}` : poster;
          const pRes = await fetch(pUrl, { signal: AbortSignal.timeout(2500) });
          if (pRes.ok) {
            const newHeaders = new Headers(pRes.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
            newHeaders.set('Content-Type', pRes.headers.get('content-type') || 'image/jpeg');
            const res = new Response(pRes.body, { status: 200, headers: newHeaders });
            if (cache && context.waitUntil) {
              context.waitUntil(cache.put(cacheKey, res.clone()));
            }
            return res;
          }
        }
      }
    } catch (_) {}
  }

  // 4. Return clean SVG placeholder image (200 OK) with dark theme branding
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#141519"/><circle cx="300" cy="400" r="45" fill="#252438"/><polygon points="285,380 285,420 325,400" fill="#8B5CF6"/><text x="300" y="490" font-family="sans-serif" font-size="22" font-weight="700" fill="#e2e8f0" text-anchor="middle">KamiAnime</text><text x="300" y="525" font-family="sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Обложка</text></svg>`;
  return new Response(fallbackSvg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
