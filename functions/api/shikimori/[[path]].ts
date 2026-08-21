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

  const path = url.pathname.replace(/^\/api\/shikimori/, '');
  const authHeader = context.request.headers.get('Authorization');
  const isGetRequest = context.request.method === 'GET';
  const canCache = isGetRequest && !authHeader;

  // 1. Check Cloudflare Cache first for public GET requests
  const cache = (caches as any)?.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  
  if (canCache && cache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse && cachedResponse.ok) {
        return cachedResponse;
      }
    } catch (_) {}
  }

  const headers = new Headers();
  headers.set('User-Agent', 'KamiAnime-Web/2.5 (client: web-browser; contact: admin@kamianime.club)');
  headers.set('Referer', 'https://shikimori.one/');
  headers.set('Accept', 'application/json, text/plain, */*');
  
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  const init: RequestInit = {
    method: context.request.method,
    headers: headers,
  };

  if (!isGetRequest && context.request.method !== 'HEAD') {
    init.body = context.request.body;
    const contentType = context.request.headers.get('Content-Type');
    if (contentType) {
      headers.set('Content-Type', contentType);
    }
  }

  // Mirrors to try in sequence
  const mirrors = [
    `https://shikimori.one/api${path}${url.search}`,
    `https://shikimori.io/api${path}${url.search}`,
    `https://desu.shikimori.one/api${path}${url.search}`
  ];

  let lastResponse: Response | null = null;

  for (const targetUrl of mirrors) {
    try {
      const response = await fetch(targetUrl, {
        ...init,
        signal: AbortSignal.timeout(4000)
      });

      if (response.ok) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', '*');
        newHeaders.delete('Content-Security-Policy');
        newHeaders.delete('X-Frame-Options');
        newHeaders.delete('Vary');
        newHeaders.delete('Set-Cookie');

        if (canCache) {
          // Cache successful response for 30 minutes on edge, 5 min in browser
          newHeaders.set('Cache-Control', 'public, max-age=300, s-maxage=1800');
        }

        const finalResponse = new Response(response.body, {
          status: 200,
          statusText: 'OK',
          headers: newHeaders,
        });

        if (canCache && cache && context.waitUntil) {
          context.waitUntil(cache.put(cacheKey, finalResponse.clone()));
        }

        return finalResponse;
      }

      lastResponse = response;
      // If 404/422, don't try other mirrors as item definitely doesn't exist
      if (response.status === 404 || response.status === 422) {
        break;
      }
    } catch (_) {
      // Continue to next mirror
    }
  }

  // Graceful fallbacks for common public GET endpoints if Shikimori rate-limits or is down
  if (isGetRequest) {
    if (path.startsWith('/calendar') || path.startsWith('/topics')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60'
        }
      });
    }

    if (path.startsWith('/animes')) {
      const idMatch = path.match(/^\/animes\/(\d+)$/);
      if (idMatch) {
        const animeId = parseInt(idMatch[1], 10);
        try {
          const anilistQuery = `query ($idMal: Int) { 
            Media(idMal: $idMal, type: ANIME) { 
              id idMal title { romaji english native } description episodes status format seasonYear averageScore genres 
              studios(isMain: true) { nodes { name } } 
              coverImage { extraLarge large medium } bannerImage 
              nextAiringEpisode { episode airingAt } 
            } 
          }`;
          const aniRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: anilistQuery, variables: { idMal: animeId } }),
            signal: AbortSignal.timeout(2500)
          });
          if (aniRes.ok) {
            const aniData: any = await aniRes.json();
            const m = aniData?.data?.Media;
            if (m) {
              const coverUrl = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '';
              const mapped = {
                id: m.idMal || m.id,
                name: m.title?.romaji || m.title?.english,
                russian: m.title?.english || m.title?.romaji,
                image: {
                  original: coverUrl,
                  preview: m.coverImage?.large || coverUrl,
                  x96: m.coverImage?.medium || coverUrl,
                  x48: m.coverImage?.medium || coverUrl
                },
                url: `/animes/${m.idMal || m.id}`,
                kind: m.format ? m.format.toLowerCase() : 'tv',
                score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.0',
                status: m.status === 'RELEASING' ? 'ongoing' : (m.status === 'FINISHED' ? 'released' : 'anons'),
                episodes: m.episodes || 0,
                episodes_aired: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : (m.episodes || 0),
                aired_on: m.seasonYear ? `${m.seasonYear}-01-01` : null,
                released_on: null,
                description: m.description ? m.description.replace(/<[^>]*>?/gm, '') : 'Описание скоро появится',
                description_html: m.description,
                genres: (m.genres || []).map((g: string, idx: number) => ({ id: idx + 1, name: g, russian: g, kind: 'genre' })),
                studios: (m.studios?.nodes || []).map((s: any, idx: number) => ({ id: idx + 1, name: s.name, filtered_name: s.name, real: true, image: null }))
              };
              return new Response(JSON.stringify(mapped), {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                  'Cache-Control': 'public, max-age=600'
                }
              });
            }
          }
        } catch (_) {}
      } else {
        // List fallback
        try {
          const aniListQuery = `query { 
            Page(page: 1, perPage: 25) { 
              media(type: ANIME, sort: [POPULARITY_DESC, TRENDING_DESC]) { 
                id idMal title { romaji english native } description episodes status format seasonYear averageScore genres 
                studios(isMain: true) { nodes { name } } 
                coverImage { extraLarge large medium } bannerImage 
                nextAiringEpisode { episode airingAt } 
              } 
            } 
          }`;
          const aniRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: aniListQuery }),
            signal: AbortSignal.timeout(2500)
          });
          if (aniRes.ok) {
            const aniData: any = await aniRes.json();
            const media = aniData?.data?.Page?.media || [];
            const mappedList = media.map((m: any) => {
              const coverUrl = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '';
              return {
                id: m.idMal || m.id,
                name: m.title?.romaji || m.title?.english,
                russian: m.title?.english || m.title?.romaji,
                image: {
                  original: coverUrl,
                  preview: m.coverImage?.large || coverUrl,
                  x96: m.coverImage?.medium || coverUrl,
                  x48: m.coverImage?.medium || coverUrl
                },
                url: `/animes/${m.idMal || m.id}`,
                kind: m.format ? m.format.toLowerCase() : 'tv',
                score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.0',
                status: m.status === 'RELEASING' ? 'ongoing' : (m.status === 'FINISHED' ? 'released' : 'anons'),
                episodes: m.episodes || 0,
                episodes_aired: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : (m.episodes || 0),
                aired_on: m.seasonYear ? `${m.seasonYear}-01-01` : null,
                released_on: null
              };
            });
            return new Response(JSON.stringify(mappedList), {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
              }
            });
          }
        } catch (_) {}
      }

      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=30'
        }
      });
    }
  }

  if (lastResponse) {
    const errorHeaders = new Headers(lastResponse.headers);
    errorHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(lastResponse.body, {
      status: lastResponse.status,
      headers: errorHeaders
    });
  }

  return new Response(JSON.stringify({ error: 'Shikimori upstream unavailable' }), { 
    status: 503,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    }
  });
};
