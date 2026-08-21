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
  const cache = (caches as any).default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  
  if (!isExplicitlyMissing && cache) {
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

  // 2. Try Shikimori CDN mirrors with strict 2500ms timeout
  if (!isExplicitlyMissing) {
    const mirrors = [
      `https://shikimori.one${path}${url.search}`,
      `https://desu.shikimori.one${path}${url.search}`,
      `https://shikimori.io${path}${url.search}`
    ];

    for (const mirrorUrl of mirrors) {
      try {
        const fetchResponse = await fetch(mirrorUrl, {
          method: 'GET',
          headers: headers,
          signal: AbortSignal.timeout(2500),
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
      } catch (_) {}
    }
  }

  // 3. Fallback to AniList GraphQL, Kodik, and Jikan
  const animeIdMatch = path.match(/\/(\d+)\.(jpg|png|webp|jpeg)$/) || url.search.match(/id=(\d+)/);
  if (animeIdMatch) {
    const animeId = parseInt(animeIdMatch[1], 10);

    // 3a. Try AniList GraphQL first
    try {
      const anilistQuery = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large medium } } }`;
      const aniRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: anilistQuery, variables: { idMal: animeId } }),
        signal: AbortSignal.timeout(2500)
      });
      if (aniRes.ok) {
        const aniData: any = await aniRes.json();
        const imgUrl = aniData?.data?.Media?.coverImage?.extraLarge || aniData?.data?.Media?.coverImage?.large || aniData?.data?.Media?.coverImage?.medium;
        if (imgUrl) {
          const aniImgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(2500) });
          if (aniImgRes.ok) {
            const newHeaders = new Headers(aniImgRes.headers);
            newHeaders.set('Access-Control-Allow-Origin', '*');
            newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
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

  // 4. Return clean SVG placeholder image (200 OK) so browser displays instantly without hanging
  const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#0f172a"/><path d="M250 400 L350 400 L300 330 Z" fill="#334155"/><circle cx="300" cy="450" r="30" fill="#334155"/><text x="300" y="530" font-family="sans-serif" font-size="24" font-weight="600" fill="#64748b" text-anchor="middle">KamiAnime</text><text x="300" y="565" font-family="sans-serif" font-size="16" fill="#475569" text-anchor="middle">Обложка</text></svg>`;
  return new Response(fallbackSvg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
