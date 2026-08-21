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

  // Extract anime ID from path
  const animeIdMatch = path.match(/(?:animes|original|preview|x96|x48)\/(\d+)\.(?:jpg|png|webp|jpeg)/i) || 
                       path.match(/\/(\d+)\.(?:jpg|png|webp|jpeg)/i) || 
                       url.search.match(/id=(\d+)/);
  const animeId = animeIdMatch ? parseInt(animeIdMatch[1], 10) : null;

  const fetchTasks: Promise<Response>[] = [];

  // 2a. Shikimori CDN mirrors (parallel)
  if (!isExplicitlyMissing) {
    const mirrors = [
      `https://shikimori.one${path}${url.search}`,
      `https://desu.shikimori.one${path}${url.search}`
    ];

    for (const mirrorUrl of mirrors) {
      fetchTasks.push(
        fetch(mirrorUrl, { method: 'GET', headers, signal: AbortSignal.timeout(1500) }).then(r => {
          if (r.ok && !r.url.includes('missing') && !r.url.includes('none.png')) return r;
          throw new Error('Shikimori mirror miss');
        })
      );
    }
  }

  // 2b. AniList GraphQL parallel task (HD covers)
  if (animeId) {
    fetchTasks.push(
      (async () => {
        const anilistQuery = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large medium } bannerImage } }`;
        const aniRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: anilistQuery, variables: { idMal: animeId } }),
          signal: AbortSignal.timeout(2200)
        });
        if (aniRes.ok) {
          const aniData: any = await aniRes.json();
          const media = aniData?.data?.Media;
          const isBannerOnly = path.includes('banner') || url.search.includes('type=banner');
          const imgUrl = isBannerOnly 
            ? (media?.bannerImage || media?.coverImage?.extraLarge)
            : (media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || media?.bannerImage);
          
          if (imgUrl) {
            const aniImgRes = await fetch(imgUrl, { 
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
              signal: AbortSignal.timeout(2500) 
            });
            if (aniImgRes.ok) return aniImgRes;
          }
        }
        throw new Error('AniList miss');
      })()
    );
  }

  // 3. Race primary tasks
  try {
    const winner = await Promise.any(fetchTasks);
    if (winner && winner.ok) {
      const newHeaders = new Headers(winner.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
      newHeaders.delete('Content-Security-Policy');
      newHeaders.delete('X-Frame-Options');
      newHeaders.delete('Vary');
      newHeaders.delete('Set-Cookie');

      const res = new Response(winner.body, {
        status: 200,
        statusText: 'OK',
        headers: newHeaders,
      });

      if (cache && context.waitUntil) {
        context.waitUntil(cache.put(cacheKey, res.clone()));
      }
      return res;
    }
  } catch (_) {}

  // 4. Fallback to Jikan API by anime ID
  if (animeId) {
    try {
      const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`, { signal: AbortSignal.timeout(2000) });
      if (jikanRes.ok) {
        const jikanData: any = await jikanRes.json();
        const imageUrl = jikanData.data?.images?.jpg?.large_image_url || jikanData.data?.images?.jpg?.image_url;
        if (imageUrl) {
          const fallbackRes = await fetch(imageUrl, { signal: AbortSignal.timeout(2000) });
          if (fallbackRes.ok) {
            const newHeaders = new Headers(fallbackRes.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
            const res = new Response(fallbackRes.body, { status: 200, headers: newHeaders });
            if (cache && context.waitUntil) {
              context.waitUntil(cache.put(cacheKey, res.clone()));
            }
            return res;
          }
        }
      }
    } catch (_) {}
  }

  // 5. Return clean SVG placeholder image (200 OK) with dark theme branding
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
