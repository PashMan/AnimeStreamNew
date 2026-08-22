export const onRequest = async (context: any) => {
  const { request } = context;
  const url = new URL(request.url);

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  let pathname = url.pathname.replace(/^\/api\/manga/, '');
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Helper functions for safe Cloudflare-native base64 encoding/decoding of unicode URLs
  const toBase64 = (str: string) => {
    try {
      const b64 = btoa(unescape(encodeURIComponent(str)));
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (e) {
      const b64 = btoa(str);
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }
  };

  const fromBase64 = (str: string) => {
    try {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) {
        b64 += '=';
      }
      return decodeURIComponent(escape(atob(b64)));
    } catch (e) {
      let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) {
        b64 += '=';
      }
      return atob(b64);
    }
  };

  // Safe timeout-controlled fetch utility to prevent node thread lock-ups on dead/firewalled mirrors in RF
  const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs: number = 4000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (e: any) {
      clearTimeout(id);
      throw e;
    }
  };

  // 0. ANIME BRIDGE: /api/manga/anime-bridge
  if (pathname === '/anime-bridge' || pathname === 'anime-bridge') {
    const title = url.searchParams.get('title') || url.searchParams.get('q') || url.searchParams.get('search') || '';
    const altTitle = url.searchParams.get('altTitle') || '';
    const episode = parseInt(url.searchParams.get('episode') || url.searchParams.get('ep') || '1', 10);
    const season = url.searchParams.get('season') || undefined;

    if (!title.trim() && !altTitle.trim()) {
      return new Response(JSON.stringify({ error: 'Anime title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const queryTerm = title || altTitle;
    const epNum = Math.max(1, isNaN(episode) ? 1 : episode);
    const mappedChapter = Math.max(1, Math.round(epNum * 2));

    const bridgeResult = {
      success: true,
      animeTitle: queryTerm,
      episode: epNum,
      season: season ? parseInt(season, 10) : 1,
      mappedChapter,
      chapterRange: `${mappedChapter}`,
      recommendedChapter: mappedChapter,
      adaptationSummary: `${epNum} серия приблизительно соответствует ${mappedChapter} главе манги.`,
      source: 'algorithmic'
    };

    return new Response(JSON.stringify(bridgeResult), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }

  // 0.1 PAGE PROXY: /api/manga/page-proxy
  if (pathname === '/page-proxy' || pathname === 'page-proxy') {
    const targetUrl = url.searchParams.get('url');
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    try {
      let referer = 'https://remanga.org/';
      if (targetUrl.includes('mangadex.org') || targetUrl.includes('mangadex.network')) {
        referer = 'https://mangadex.org/';
      } else if (targetUrl.includes('shikimori.one') || targetUrl.includes('shikimori.org')) {
        referer = 'https://shikimori.one/';
      } else if (url.searchParams.get('_zaza') || targetUrl.includes('rmr.rocks') || targetUrl.includes('one-way.work') || targetUrl.includes('zazaza.me')) {
        referer = 'https://a.zazaza.me/';
      }
      
      let res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': referer,
          'Accept': 'image/*'
        }
      });

      if (!res.ok && targetUrl.includes('.mangadex.network')) {
        const chapterId = url.searchParams.get('chapterId');
        if (chapterId) {
          try {
            const nodeRes = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}?forcePort443=true`);
            const nodeData: any = await nodeRes.json();
            if (nodeData && nodeData.baseUrl) {
               const filename = targetUrl.split('/').pop();
               const marker = targetUrl.includes('/data-saver/') ? '/data-saver/' : '/data/';
               const hash = nodeData.chapter?.hash;
               if (hash && filename) {
                  const newUrl = `${nodeData.baseUrl}${marker}${hash}/${filename}`;
                  res = await fetch(newUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      'Referer': 'https://mangadex.org/'
                    }
                  });
               }
            }
          } catch(e) {}
        }

        if (!res.ok) {
          const index = targetUrl.indexOf('/data/');
          const indexSaver = targetUrl.indexOf('/data-saver/');
          const marker = indexSaver !== -1 ? '/data-saver/' : '/data/';
          const markerIndex = indexSaver !== -1 ? indexSaver : index;
          if (markerIndex !== -1) {
            try {
              const remainingPath = targetUrl.substring(markerIndex + marker.length);
              const fallbackUrl = `https://uploads.mangadex.org${marker}${remainingPath}`;
              res = await fetch(fallbackUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mangadex.org/' }
              });
            } catch(e) {}
          }
        }
      }

      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'Proxy fails' }), { status: res.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }

      const blob = await res.arrayBuffer();
      const contentType = res.headers.get('content-type') || 'image/jpeg';
      
      return new Response(blob, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch(err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
  }

  // 1. SEARCH: /api/manga/search
  if (pathname === '/search' || pathname === 'search') {
    const query = url.searchParams.get('q') || '';
    const limitVal = Number(url.searchParams.get('limit') || '60');
    const offsetVal = Number(url.searchParams.get('offset') || '0');
    const order = url.searchParams.get('order') || '';
    const requestedSource = url.searchParams.get('source') || 'all';

    let mdUrl = `https://api.mangadex.org/manga?limit=${limitVal}&offset=${offsetVal}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&availableTranslatedLanguage[]=ru&hasAvailableChapters=true`;
    if (query) {
      mdUrl += `&title=${encodeURIComponent(query)}`;
    } else if (order) {
      if (order === 'latestUploadedChapter') {
        mdUrl += `&order[latestUploadedChapter]=desc`;
      } else {
        mdUrl += `&order[followedCount]=desc`;
      }
    } else {
      mdUrl += `&order[followedCount]=desc`;
    }

    let shikiUrl = `https://shikimori.one/api/mangas?limit=${limitVal}`;
    if (query) {
      shikiUrl += `&search=${encodeURIComponent(query)}`;
    } else {
      shikiUrl += `&page=${Math.floor(offsetVal / limitVal) + 1}`;
      if (order === 'followedCount' || order === 'rating' || !order) {
        shikiUrl += `&order=popularity`;
      } else {
        shikiUrl += `&order=id`;
      }
    }

    let rmUrl = `https://api.remanga.org/api/search/catalog/?count=${limitVal}&offset=${offsetVal}`;
    if (query) {
      rmUrl += `&search=${encodeURIComponent(query)}`;
    } else {
      if (order === 'latestUploadedChapter') {
        rmUrl += `&ordering=-chapter_date`;
      } else {
        rmUrl += `&ordering=-rating`;
      }
    }

    const shouldFetchMD = ['all', 'mangadex', 'mangalib', 'readmanga', 'mangaovh'].includes(requestedSource);
    const shouldFetchShiki = ['all', 'shikimori', 'mangalib', 'readmanga', 'inkstory'].includes(requestedSource);
    const shouldFetchRM = ['all', 'remanga', 'mangaovh', 'inkstory'].includes(requestedSource);

    try {
      const [mdRes, shikiRes, rmRes] = await Promise.allSettled([
        shouldFetchMD ? fetch(mdUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        }).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
        shouldFetchShiki ? fetch(shikiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://shikimori.one/',
            'Accept': 'application/json'
          }
        }).then(r => r.ok ? r.json() : null) : Promise.resolve(null),
        shouldFetchRM ? fetch(rmUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        }).then(r => r.ok ? r.json() : null) : Promise.resolve(null)
      ]);

      const hasCyrillic = (str: string) => /[а-яА-ЯёЁ]/.test(str);

      let mdResults: any[] = [];
      if (mdRes.status === 'fulfilled' && mdRes.value && mdRes.value.data) {
        mdResults = mdRes.value.data.map((manga: any) => {
          const id = manga.id;
          const attrs = manga.attributes || {};
          let title = attrs.title?.ru || 'Без названия';
          if (title === 'Без названия' && attrs.altTitles && Array.isArray(attrs.altTitles)) {
            const ruTitleObj = attrs.altTitles.find((t: any) => t.ru);
            if (ruTitleObj) title = ruTitleObj.ru;
          }
          if (title === 'Без названия' || !hasCyrillic(title)) return null;

          let description = attrs.description?.ru;
          if (!description) return null;

          const originalTitle = attrs.title?.['ja-ro'] || attrs.title?.ja || attrs.title?.en || '';
          let cover = '';
          const coverRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
          if (coverRel && coverRel.attributes?.fileName) {
            const fileName = coverRel.attributes.fileName;
            cover = `/api/manga/page-proxy?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${id}/${fileName}.512.jpg`)}&_cb=3`;
          } else {
            cover = `https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80`;
          }
          description = description.replace(/\[\w+=\w+\]/g, '').replace(/\[\/\w+\]/g, '').replace(/\[hr\]/g, '');
          const genres = attrs.tags
            ?.filter((t: any) => t.attributes?.group === 'genre')
            ?.map((t: any) => t.attributes?.name?.ru || t.attributes?.name?.en)
            ?.filter(Boolean) || [];

          return {
            id,
            title,
            originalTitle,
            rating: Number((8.1 + Math.random() * 1.6).toFixed(1)),
            status: attrs.status === 'ongoing' ? 'Онгоинг' : (attrs.status === 'completed' ? 'Завершен' : 'Приостановлен'),
            description,
            cover,
            genres: genres.slice(0, 3) || ["Манга"],
            chapters: attrs.lastChapter ? Number(attrs.lastChapter) : (attrs.lastVolume ? Number(attrs.lastVolume)*10 : 12)
          };
        }).filter(Boolean);
      }

      let rmResults: any[] = [];
      if (rmRes.status === 'fulfilled' && rmRes.value && rmRes.value.content) {
        rmResults = rmRes.value.content.map((m: any) => {
          let title = m.rus_name || 'Без названия';
          if (!hasCyrillic(title)) return null;
          if (!m.count_chapters || m.count_chapters === 0) return null;

          let rmCover = m.img?.high || m.img?.mid || m.cover_high || '';
          if (rmCover.startsWith('/')) rmCover = `https://remanga.org${rmCover}`;

          return {
            id: `remanga-${m.dir}`,
            title,
            originalTitle: m.en_name || '',
            rating: m.avg_rating ? parseFloat(m.avg_rating) : 8.0,
            status: m.issue_year ? `С ${m.issue_year}` : 'Статус неизвестен',
            description: 'Описание из ReManga.org',
            cover: rmCover ? `/api/manga/page-proxy?url=${encodeURIComponent(rmCover)}&_cb=3` : '',
            genres: m.categories ? m.categories.map((c: any) => c.name) : ["Манга"],
            chapters: m.count_chapters || 0
          };
        }).filter(Boolean);
      }

      const seenTitles = new Set();
      const interleaved: any[] = [];
      const pushIfUnique = (item: any) => {
        const canonical = item.title.toLowerCase().trim();
        if (!seenTitles.has(canonical)) {
          seenTitles.add(canonical);
          interleaved.push(item);
        }
      };

      const maxLength = Math.max(mdResults.length, rmResults.length);
      for (let i = 0; i < maxLength; i++) {
        if (i < rmResults.length) pushIfUnique(rmResults[i]);
        if (i < mdResults.length) pushIfUnique(mdResults[i]);
      }

      return new Response(JSON.stringify({ results: interleaved }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
        }
      });
    } catch(err: any) {
      return new Response(JSON.stringify({ error: err.message, results: [] }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  // 1.5. SINGLE DETAILS: /api/manga/:id
  const singleMangaMatch = pathname.match(/^\/([a-zA-Z0-9\-_]{3,40})\/?$/);
  if (singleMangaMatch && !singleMangaMatch[1].endsWith('search') && !singleMangaMatch[1].endsWith('chapters') && !singleMangaMatch[1].endsWith('pages')) {
    const mangaId = singleMangaMatch[1];
    
    if (mangaId.startsWith('remanga-')) {
      const rawId = mangaId.replace('remanga-', '');
      let mangaResponse: any = null;
      try {
        const res = await fetch(`https://api.remanga.org/api/titles/${rawId}/`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const data: any = await res.json();
        const content = data?.content;
        if (content) {
          const title = content.rus_name || 'Без названия';
          const originalTitle = content.en_name || content.dir || '';
          let coverUrl = content.img?.high ? `https://remanga.org${content.img.high}` : (content.img?.mid ? `https://remanga.org${content.img.mid}` : '');
          const cover = coverUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(coverUrl)}&_cb=3` : 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80';
          const description = content.description || 'Описание отсутствует.';
          const genres = content.categories?.map((c: any) => c.name) || ["Манга"];
          const status = content.status?.name || 'Статус неизвестен';
          
          mangaResponse = {
            id: mangaId,
            title,
            originalTitle,
            rating: content.avg_rating ? parseFloat(content.avg_rating) : 8.0,
            status,
            description,
            cover,
            genres: genres.slice(0, 3)
          };
        }
      } catch (err: any) {}

      if (mangaResponse) {
        return new Response(JSON.stringify({ manga: mangaResponse }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    if (mangaId.startsWith('shiki-')) {
      const rawId = mangaId.replace('shiki-', '');
      try {
        const res = await fetch(`https://shikimori.one/api/mangas/${rawId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://shikimori.one/'
          }
        });
        const m: any = await res.json();
        const cover = m.image?.original ? `/api/manga/page-proxy?url=${encodeURIComponent(`https://shikimori.one${m.image.original}`)}&_cb=3` : 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80';
        return new Response(JSON.stringify({
          manga: {
            id: mangaId,
            title: m.russian || m.name,
            originalTitle: m.name,
            rating: m.score ? parseFloat(m.score) : 8.0,
            status: m.status === 'released' ? 'Завершен' : 'Онгоинг',
            description: m.description || 'Описание отсутствует.',
            cover,
            genres: m.genres ? m.genres.map((g: any) => g.russian || g.name).slice(0, 3) : ["Манга"]
          }
        }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    // Default MangaDex single details
    try {
      const res = await fetch(`https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data: any = await res.json();
      if (!data || !data.data) {
        return new Response(JSON.stringify({ error: 'Manga not found' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const m = data.data;
      const attrs = m.attributes;
      let title = attrs.title?.ru || attrs.title?.en || attrs.title?.['ja-ro'] || 'Без названия';
      if (attrs.altTitles && Array.isArray(attrs.altTitles)) {
        const ruTitle = attrs.altTitles.find((t: any) => t.ru);
        if (ruTitle) title = ruTitle.ru;
      }
      const originalTitle = attrs.title?.['ja-ro'] || attrs.title?.ja || attrs.title?.en || '';
      let cover = '';
      const coverRel = m.relationships?.find((r: any) => r.type === 'cover_art');
      if (coverRel && coverRel.attributes?.fileName) {
        const fileName = coverRel.attributes.fileName;
        cover = `/api/manga/page-proxy?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`)}&_cb=3`;
      } else {
        cover = `https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80`;
      }
      let description = attrs.description?.ru || 'Описание отсутствует.';
      description = description.replace(/\[\w+=\w+\]/g, '').replace(/\[\/\w+\]/g, '').replace(/\[hr\]/g, '');
      const genres = attrs.tags
        ?.filter((t: any) => t.attributes?.group === 'genre')
        ?.map((t: any) => t.attributes?.name?.ru || t.attributes?.name?.en)
        ?.filter(Boolean) || [];

      return new Response(JSON.stringify({
        manga: {
          id: mangaId,
          title,
          originalTitle,
          rating: Number((8.1 + Math.random() * 1.6).toFixed(1)),
          status: attrs.status === 'ongoing' ? 'Онгоинг' : (attrs.status === 'completed' ? 'Завершен' : 'Приостановлен'),
          description,
          cover,
          genres: genres.slice(0, 3)
        }
      }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
  }

  // 2.5 RELATED & SIMILAR: /api/manga/:id/related-similar or /api/manga/related-similar
  const relSimMatch = pathname.match(/^\/([a-zA-Z0-9\-_]+)\/related-similar\/?$/) || (pathname === '/related-similar' ? [null, ''] : null);
  if (relSimMatch || pathname === '/related-similar') {
    const mangaId = relSimMatch ? relSimMatch[1] : (url.searchParams.get('id') || '');
    const titleHint = url.searchParams.get('title') || '';
    const altTitleHint = url.searchParams.get('altTitle') || '';
    
    let shikiId: string | number = '';
    if (mangaId && mangaId.startsWith('shiki-')) {
      shikiId = mangaId.replace('shiki-', '');
    } else {
      const searchTerms: string[] = [];
      if (titleHint) searchTerms.push(titleHint);
      if (altTitleHint) searchTerms.push(altTitleHint);
      if (mangaId && mangaId.startsWith('remanga-')) {
        const cleanDir = mangaId.replace('remanga-', '');
        searchTerms.push(cleanDir.replace(/_/g, ' '));
      }
      for (const term of searchTerms) {
        if (!term || term.length < 2) continue;
        try {
          const sRes = await fetch(`https://shikimori.one/api/mangas?search=${encodeURIComponent(term)}&limit=1`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
          });
          if (sRes.ok) {
            const sData: any = await sRes.json();
            if (Array.isArray(sData) && sData.length > 0 && sData[0].id) {
              shikiId = sData[0].id;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!shikiId) {
      return new Response(JSON.stringify({ success: true, related: [], similar: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const [relRes, simRes] = await Promise.all([
        fetch(`https://shikimori.one/api/mangas/${shikiId}/related`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        }),
        fetch(`https://shikimori.one/api/mangas/${shikiId}/similar`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        })
      ]);

      const relData: any = relRes.ok ? await relRes.json() : [];
      const simData: any = simRes.ok ? await simRes.json() : [];

      const related = Array.isArray(relData) ? relData.map((item: any) => {
        const relName = item.relation_russian || item.relation || 'Связанное';
        if (item.anime) {
          const a = item.anime;
          const imgUrl = a.image ? (a.image.original || a.image.preview || '') : '';
          const fullImg = imgUrl.startsWith('http') ? imgUrl : `https://shikimori.one${imgUrl}`;
          return {
            relation: relName,
            type: 'anime',
            anime: {
              id: a.id,
              title: a.russian || a.name,
              originalTitle: a.name,
              cover: imgUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(fullImg)}&_cb=3` : '',
              kind: a.kind,
              year: a.aired_on ? a.aired_on.slice(0, 4) : '',
              score: a.score
            }
          };
        } else if (item.manga) {
          const m = item.manga;
          const imgUrl = m.image ? (m.image.original || m.image.preview || '') : '';
          const fullImg = imgUrl.startsWith('http') ? imgUrl : `https://shikimori.one${imgUrl}`;
          return {
            relation: relName,
            type: 'manga',
            manga: {
              id: `shiki-${m.id}`,
              title: m.russian || m.name,
              originalTitle: m.name,
              cover: imgUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(fullImg)}&_cb=3` : '',
              kind: m.kind,
              score: m.score,
              status: m.status === 'released' ? 'Завершен' : 'Онгоинг'
            }
          };
        }
        return null;
      }).filter(Boolean) : [];

      const similar = Array.isArray(simData) ? simData.map((m: any) => {
        const imgUrl = m.image ? (m.image.original || m.image.preview || '') : '';
        const fullImg = imgUrl.startsWith('http') ? imgUrl : `https://shikimori.one${imgUrl}`;
        const kindLabel = m.kind === 'manhwa' ? 'Манхва' : (m.kind === 'manhua' ? 'Маньхуа' : 'Манга');
        return {
          id: `shiki-${m.id}`,
          title: m.russian || m.name,
          originalTitle: m.name,
          cover: imgUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(fullImg)}&_cb=3` : '',
          rating: m.score ? parseFloat(m.score) : 8.0,
          status: m.status === 'released' ? 'Завершен' : 'Онгоинг',
          genres: [kindLabel],
          chapters: m.chapters || 0
        };
      }) : [];

      return new Response(JSON.stringify({ success: true, related, similar }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: true, related: [], similar: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }

  // 3. CHAPTERS LIST: /api/manga/:id/chapters
  const chaptersMatch = pathname.match(/^\/([a-zA-Z0-9\-_]+)\/chapters\/?$/);
  if (chaptersMatch) {
    let mangaId = chaptersMatch[1];
    let searchTitles: string[] = [];
    let mdMangaId = mangaId;

    if (mangaId.startsWith('remanga-')) {
      const explicitRemangaDir = mangaId.replace('remanga-', '');
      searchTitles.push(explicitRemangaDir.replace(/-/g, ' '));
      
      try {
        const mdSearchUrl = `https://api.mangadex.org/manga?limit=3&title=${encodeURIComponent(explicitRemangaDir.replace(/-/g, ' '))}&availableTranslatedLanguage[]=ru`;
        const mdRes = await fetch(mdSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const mdData: any = mdRes.ok ? await mdRes.json() : null;
        if (mdData && mdData.data && mdData.data.length > 0) {
          mdMangaId = mdData.data[0].id;
        }
      } catch(e) {}
    } else if (mangaId.startsWith('shiki-')) {
      const rawId = mangaId.replace('shiki-', '');
      try {
        const shikiRes = await fetch(`https://shikimori.one/api/mangas/${rawId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://shikimori.one/'
          }
        });
        const m: any = await shikiRes.json();
        if (m && !m.error) {
          if (m.russian) searchTitles.push(m.russian);
          if (m.name) searchTitles.push(m.name);
          if (m.japanese && m.japanese[0]) searchTitles.push(m.japanese[0]);
          if (m.japanese && Array.isArray(m.japanese)) {
            m.japanese.forEach((jpName: string) => searchTitles.push(jpName));
          }
        }
      } catch (e) {}

      for (const title of searchTitles.slice(0, 2)) {
        if (!title) continue;
        const mdSearchUrl = `https://api.mangadex.org/manga?limit=2&title=${encodeURIComponent(title)}&availableTranslatedLanguage[]=ru`;
        try {
          const mdRes = await fetch(mdSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const mdData: any = mdRes.ok ? await mdRes.json() : null;
          if (mdData && mdData.data && mdData.data.length > 0) {
            mdMangaId = mdData.data[0].id;
            break;
          }
        } catch (err) {}
      }
    } else {
      try {
        const mdRes = await fetch(`https://api.mangadex.org/manga/${mangaId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const mdData: any = await mdRes.json();
        if (mdData && mdData.data) {
          const attrs = mdData.data.attributes || {};
          if (attrs.title?.ru) searchTitles.push(attrs.title.ru);
          if (attrs.title?.en) searchTitles.push(attrs.title.en);
          if (attrs.title?.ja) searchTitles.push(attrs.title.ja);
          if (attrs.title?.['ja-ro']) searchTitles.push(attrs.title['ja-ro']);
          if (attrs.altTitles && Array.isArray(attrs.altTitles)) {
            attrs.altTitles.forEach((t: any) => {
              if (t.ru) searchTitles.push(t.ru);
              if (t.en) searchTitles.push(t.en);
            });
          }
        }
      } catch(e) {}
    }

    const uniqueQueryTitles = Array.from(new Set(searchTitles.filter(Boolean)));

    // 1. Fetch ReManga Chapters
    const fetchRemangaChapters = async (): Promise<any[]> => {
      let remangaDir = mangaId.startsWith('remanga-') ? mangaId.replace('remanga-', '') : '';
      if (!remangaDir) {
        for (const title of uniqueQueryTitles.slice(0, 3)) {
          try {
            const sRes = await fetch(`https://api.remanga.org/api/search/?query=${encodeURIComponent(title)}&count=3`, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://remanga.org/',
                'Accept': 'application/json, text/plain, */*'
              }
            });
            if (sRes.ok && sRes.headers.get('content-type')?.includes('application/json')) {
              const sData: any = await sRes.json();
              if (sData?.content?.[0]?.dir) {
                remangaDir = sData.content[0].dir;
                break;
              }
            }
          } catch(e) {}
        }
      }
      if (!remangaDir) return [];

      try {
        const detailRes = await fetch(`https://api.remanga.org/api/titles/${remangaDir}/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://remanga.org/',
            'Accept': 'application/json, text/plain, */*'
          }
        });
        if (!detailRes.ok || !detailRes.headers.get('content-type')?.includes('application/json')) return [];
        const detailData: any = await detailRes.json();
        const branches = detailData?.content?.branches;
        if (!branches || !Array.isArray(branches)) return [];

        const rmChaps: any[] = [];
        await Promise.allSettled(branches.map(async (branch: any) => {
          try {
            const chRes = await fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branch.id}&limit=250&page=1`, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://remanga.org/',
                'Accept': 'application/json, text/plain, */*'
              }
            });
            if (!chRes.ok || !chRes.headers.get('content-type')?.includes('application/json')) return;
            const chData: any = await chRes.json();
            const chList = chData?.content;
            if (Array.isArray(chList)) {
              chList.forEach((ch: any) => {
                rmChaps.push({
                  id: `remanga-${ch.id}`,
                  chapter: String(ch.chapter || '0'),
                  volume: String(ch.volume || ''),
                  title: ch.name || `Глава ${ch.chapter || ''}`,
                  group: 'Команда перевода',
                  publishAt: ch.pub_date || new Date().toISOString()
                });
              });
            }
          } catch(e) {}
        }));
        return rmChaps;
      } catch(e) {
        return [];
      }
    };

    // 2. Fetch MangaDex Chapters
    const fetchMangaDexChapters = async (): Promise<any[]> => {
      if (!mdMangaId || mdMangaId.startsWith('shiki-') || mdMangaId.startsWith('remanga-')) return [];
      const getFeed = async (lang: string) => {
        const feedUrl = `https://api.mangadex.org/manga/${mdMangaId}/feed?translatedLanguage[]=${lang}&order[chapter]=asc&limit=500&includes[]=scanlation_group`;
        try {
          const res = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const data: any = await res.json();
          if (data?.data && Array.isArray(data.data)) {
            return data.data.map((ch: any) => {
              const attrs = ch.attributes || {};
              return {
                id: ch.id,
                chapter: String(attrs.chapter || '0'),
                volume: String(attrs.volume || ''),
                title: attrs.title || `Глава ${attrs.chapter || ''}`,
                group: 'Команда перевода',
                publishAt: attrs.publishAt
              };
            });
          }
        } catch(e) {}
        return [];
      };

      const [ru, en] = await Promise.all([getFeed('ru'), getFeed('en')]);
      return [...ru, ...en];
    };

    // 3. Fetch ReadManga / Zaza Chapters
    const fetchZazaChapters = async (): Promise<any[]> => {
      let zazaPath = '';
      for (const title of uniqueQueryTitles.slice(0, 3)) {
        try {
          const suggRes = await fetch('https://a.zazaza.me/search/suggestion?query=' + encodeURIComponent(title));
          const suggData: any = await suggRes.json();
          const suggestion = suggData?.suggestions?.find((s: any) => s.link && (s.link.startsWith('/') || s.link.startsWith('http')));
          if (suggestion?.link) {
            zazaPath = suggestion.link;
            break;
          }
        } catch(e) {}
      }

      if (!zazaPath) return [];

      try {
        const fullUrl = zazaPath.startsWith('http') ? zazaPath + '?mtr=1' : 'https://a.zazaza.me' + zazaPath + '?mtr=1';
        const htmlRes = await fetch(fullUrl, {
           headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const html = await htmlRes.text();
        const regex = /href="(\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        const seen = new Set();
        const chaps: any[] = [];
        while ((match = regex.exec(html)) !== null) {
            if (match[2].includes('Читать')) continue;
            if (!match[1].includes('/vol')) continue;
            let path = match[1];
            if (path.includes('?')) path = path.split('?')[0];
            if (path.includes('#')) path = path.split('#')[0];
            
            if (seen.has(path)) continue;
            seen.add(path);

            let chTitle = match[2].trim().replace(/<[^>]+>/g, '').trim();
            const targetUrl = zazaPath.startsWith('http') ? (new URL(zazaPath).origin + path) : path;
            chaps.push({
               id: `zaza-${toBase64(targetUrl)}`,
               title: chTitle || 'Глава',
               volume: path.match(/vol(\d+)/)?.[1] || '1',
               chapter: path.match(/vol\d+\/([\d.,]+)/)?.[1] || '0',
               group: 'Команда перевода',
               publishAt: new Date().toISOString()
            });
        }
        return chaps.reverse();
      } catch(e) {
        return [];
      }
    };

    // Execute in parallel
    const [rmList, mdList, zazaList] = await Promise.all([
      fetchRemangaChapters(),
      fetchMangaDexChapters(),
      fetchZazaChapters()
    ]);

    const allChapters = [...rmList, ...mdList, ...zazaList];

    // De-duplicate chapters by [chapter_number + group_name]
    const chKeys = new Set();
    const filteredChapters = allChapters.filter((ch: any) => {
      const key = `${ch.chapter}-${ch.group}`;
      if (chKeys.has(key)) return false;
      chKeys.add(key);
      return true;
    });

    filteredChapters.sort((a: any, b: any) => {
      const numA = parseFloat(a.chapter) || 0;
      const numB = parseFloat(b.chapter) || 0;
      return numA - numB;
    });

    return new Response(JSON.stringify({ chapters: filteredChapters, isLicensed: false }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 2. PAGES FOR CHAPTER: /api/manga/chapter/:chapterId/pages
  const chapterPagesMatch = pathname.match(/^\/chapter\/(.+)\/pages\/?$/);
  if (chapterPagesMatch) {
    const chapterId = chapterPagesMatch[1];

    if (chapterId.startsWith('zaza-')) {
      const rawPath = fromBase64(chapterId.replace('zaza-', ''));
      const debugLogs: string[] = [];
      debugLogs.push(`[zaza] RawPath decoded: "${rawPath}"`);
      try {
        const urlsToTry: string[] = [];
        if (rawPath.startsWith('http')) {
          urlsToTry.push(`${rawPath}?mtr=1`);
          try {
            const parsedUrl = new URL(rawPath);
            const pathname = parsedUrl.pathname;
            urlsToTry.push(`https://a.zazaza.me${pathname}?mtr=1`);
            urlsToTry.push(`https://1.seimanga.me${pathname}?mtr=1`);
            urlsToTry.push(`https://readmanga.live${pathname}?mtr=1`);
            urlsToTry.push(`https://mintmanga.live${pathname}?mtr=1`);
            urlsToTry.push(`https://selfmanga.live${pathname}?mtr=1`);
          } catch (e: any) {
            debugLogs.push(`[zaza] Error parsing rawPath URL: ${e.message}`);
          }
        } else {
          const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
          urlsToTry.push(`https://a.zazaza.me${cleanPath}?mtr=1`);
          urlsToTry.push(`https://1.seimanga.me${cleanPath}?mtr=1`);
          urlsToTry.push(`https://readmanga.live${cleanPath}?mtr=1`);
          urlsToTry.push(`https://mintmanga.live${cleanPath}?mtr=1`);
          urlsToTry.push(`https://selfmanga.live${cleanPath}?mtr=1`);
        }

        let pagesMatch: any = null;
        let pageHtml = "";
        let finalSuccessUrl = "";

        for (const targetUrl of urlsToTry) {
          debugLogs.push(`[zaza] Iterating candidate URL: ${targetUrl}`);
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              const res = await fetchWithTimeout(targetUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                  'Accept-Language': 'ru,en-US;q=0.9,en;q=0.8'
                }
              }, 3500);
              pageHtml = await res.text().catch(() => "");
              
              pagesMatch = pageHtml.match(/rm_h\.readerInit\s*\(\s*[^,]*\s*,\s*(\[\[[\s\S]*?\]\])/);
              if (pagesMatch) {
                debugLogs.push(`[zaza] Regex scanner: SUCCESS! Extracted array length: ${pagesMatch[1].length}`);
                finalSuccessUrl = targetUrl;
                break; 
              }
            } catch (err: any) {
              debugLogs.push(`[zaza] Attempt ${attempt} exception: ${err.message || err}`);
            }
            if (attempt < 2 && !pagesMatch) {
              await new Promise(r => setTimeout(r, 200));
            }
          }
          if (pagesMatch) {
            break; 
          }
        }

        if (pagesMatch) {
          const arrayText = pagesMatch[1];
          let parsedArray: any[] = [];
          try {
            let jsonText = arrayText
              .replace(/'/g, '"')
              .replace(/,\s*\]/g, ']')
              .replace(/,\s*\}/g, '}');
            parsedArray = JSON.parse(jsonText);
          } catch (jsonErr: any) {
            const innerBracketMatches = arrayText.match(/\[\s*[^\]]*\s*\]/g);
            if (innerBracketMatches) {
              for (const innerStr of innerBracketMatches) {
                const stringMatches = Array.from(innerStr.matchAll(/(?:'([^']*)'|"([^"]*)")/g)).map(m => m[1] || m[2] || '');
                if (stringMatches.length >= 3) {
                  parsedArray.push([
                    stringMatches[0] || '',
                    stringMatches[1] || '',
                    stringMatches[2] || ''
                  ]);
                }
              }
            }
          }

          let isDeleted = false;
          const pages = parsedArray.map((item: any) => {
            const fullUrl = `${item[0] || ''}${item[2] || ''}`;
            if (fullUrl.includes('deleted1.png')) {
               isDeleted = true;
            }
            return `/api/manga/page-proxy?url=${encodeURIComponent(fullUrl)}&_zaza=1`;
          });
          
          if (!isDeleted && pages.length > 0) {
            debugLogs.push(`[zaza] Successfully extracted ${pages.length} pages.`);
            return new Response(JSON.stringify({ pages, debugLogs, successUrl: finalSuccessUrl }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          } else {
            debugLogs.push(`[zaza] Chapter is licensed/deleted on ReadManga (deleted1.png). Starting auto-fallback to MangaDex / ReManga...`);
          }
        }

        // Automatic fallback: extract chapter number & slug to find chapter on MangaDex or ReManga
        const pathPart = rawPath.split('?')[0];
        const matchVolChap = pathPart.match(/vol(\d+)\/([\d.,]+)/);
        const targetChapNum = matchVolChap ? matchVolChap[2] : '1';
        const cleanSlug = pathPart.split('/')[1] ? pathPart.split('/')[1].replace(/_/g, ' ') : '';
        debugLogs.push(`[zaza-fallback] Searching alternative sources for title "${cleanSlug}" chapter ${targetChapNum}...`);

        if (cleanSlug) {
          // 1. Try ReManga
          try {
            const rmSearch = await fetch(`https://api.remanga.org/api/search/?query=${encodeURIComponent(cleanSlug)}&count=2`);
            const rmData: any = await rmSearch.json();
            const dir = rmData?.content?.[0]?.dir;
            if (dir) {
              const dtRes = await fetch(`https://api.remanga.org/api/titles/${dir}/`);
              const dtData: any = await dtRes.json();
              const branchId = dtData?.content?.branches?.[0]?.id;
              if (branchId) {
                const chRes = await fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branchId}&limit=250&page=1`);
                const chData: any = await chRes.json();
                const matchedCh = chData?.content?.find((c: any) => String(c.chapter) === String(targetChapNum) || Math.abs(parseFloat(c.chapter) - parseFloat(targetChapNum)) < 0.1);
                if (matchedCh?.id) {
                  const pagesRes = await fetch(`https://api.remanga.org/api/titles/chapters/${matchedCh.id}/`);
                  const pagesData: any = await pagesRes.json();
                  const cObj = pagesData?.content;
                  if (cObj?.pages || cObj?.scans) {
                    const servers = cObj.servers || ['https://img.remanga.org'];
                    const pageItems = cObj.pages || cObj.scans || [];
                    const pages = pageItems.map((page: any) => {
                      let link = typeof page === 'string' ? page : (Array.isArray(page) ? page[2] : (page.link || page.url || ''));
                      if (link && !link.startsWith('http')) {
                        const mainServer = servers[0] ? servers[0].replace(/\/$/, '') : 'https://img.remanga.org';
                        link = `${mainServer}${link.startsWith('/') ? link : '/' + link}`;
                      }
                      return link ? `/api/manga/page-proxy?url=${encodeURIComponent(link)}` : '';
                    }).filter(Boolean);

                    if (pages.length > 0) {
                      debugLogs.push(`[zaza-fallback] Successfully loaded ${pages.length} real pages via ReManga fallback!`);
                      return new Response(JSON.stringify({ pages, debugLogs, isFallback: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
                    }
                  }
                }
              }
            }
          } catch(e: any) {
            debugLogs.push(`[zaza-fallback] ReManga fallback error: ${e.message}`);
          }

          // 2. Try MangaDex
          try {
            const mdSearch = await fetch(`https://api.mangadex.org/manga?limit=2&title=${encodeURIComponent(cleanSlug)}`);
            const mdData: any = await mdSearch.json();
            const mdId = mdData?.data?.[0]?.id;
            if (mdId) {
              const feedRes = await fetch(`https://api.mangadex.org/manga/${mdId}/feed?limit=500`);
              const feedData: any = await feedRes.json();
              const matchedDex = feedData?.data?.find((c: any) => String(c.attributes?.chapter) === String(targetChapNum));
              if (matchedDex?.id) {
                const srvRes = await fetch(`https://api.mangadex.org/at-home/server/${matchedDex.id}`);
                const srvData: any = await srvRes.json();
                if (srvData?.chapter?.data) {
                  const hash = srvData.chapter.hash;
                  const baseUrl = srvData.baseUrl;
                  const pages = srvData.chapter.data.map((fn: string) => `/api/manga/page-proxy?url=${encodeURIComponent(`${baseUrl}/data/${hash}/${fn}`)}&chapterId=${matchedDex.id}`);
                  debugLogs.push(`[zaza-fallback] Successfully loaded ${pages.length} real pages via MangaDex fallback!`);
                  return new Response(JSON.stringify({ pages, debugLogs, isFallback: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
                }
              }
            }
          } catch(e: any) {
            debugLogs.push(`[zaza-fallback] MangaDex fallback error: ${e.message}`);
          }
        }

        return new Response(JSON.stringify({ error: 'Издательская блокировка: Главы удалены правообладателем в РФ.', isLicensed: true, pages: [], debugLogs }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch(e: any) {
        debugLogs.push(`[zaza] Outer handler exception: ${e.message || e}`);
        return new Response(JSON.stringify({ pages: [], debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    if (chapterId.startsWith('remanga-')) {
      const rawChId = chapterId.replace('remanga-', '');
      const rmUrl = `https://api.remanga.org/api/titles/chapters/${rawChId}/`;
      const debugLogs: string[] = [`[remanga] Starting fetch for Chapter: ${rawChId}`];
      try {
        const res = await fetch(rmUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
          }
        });
        if (res.status !== 200) {
          return new Response(JSON.stringify({ pages: [], debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
        const data: any = await res.json();
        const cObj = data?.content;
        if (!cObj) {
          return new Response(JSON.stringify({ pages: [], debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }

        const servers = cObj.servers || ['https://img.remanga.org'];
        const pageItems = cObj.pages || cObj.scans || [];
        const pages = pageItems.map((page: any) => {
          let link = "";
          if (typeof page === 'string') {
            link = page;
          } else if (page && typeof page === 'object') {
            if (Array.isArray(page)) {
              link = page[2] || "";
            } else {
              link = page.link || page.url || "";
            }
          }
          if (link && !link.startsWith('http')) {
            if (!link.startsWith('/')) {
              link = '/' + link;
            }
            const mainServer = servers[0] ? servers[0].replace(/\/$/, '') : 'https://img.remanga.org';
            link = `${mainServer}${link}`;
          }
          if (link) {
            return `/api/manga/page-proxy?url=${encodeURIComponent(link)}`;
          }
          return '';
        }).filter(Boolean);

        return new Response(JSON.stringify({ pages, debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message, pages: [], debugLogs }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
    }

    const dexUrl = `https://api.mangadex.org/at-home/server/${chapterId}`;
    const debugLogs: string[] = [`[mangadex] Preparing fetch for DexChapterId ${chapterId}`];
    try {
      const res = await fetch(dexUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (res.status !== 200) {
        return new Response(JSON.stringify({ pages: [], debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const data: any = await res.json();
      if (!data || !data.chapter) {
        return new Response(JSON.stringify({ pages: [], debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      const hash = data.chapter.hash;
      const baseUrl = data.baseUrl;
      const filenames = data.chapter.data;
      const pages = filenames.map((filename: string) => {
        const rawUrl = `${baseUrl}/data/${hash}/${filename}`;
        return `/api/manga/page-proxy?url=${encodeURIComponent(rawUrl)}&chapterId=${chapterId}`;
      });
      return new Response(JSON.stringify({ pages, debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message, pages: [], debugLogs }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
  }

  // Route not found
  return new Response(JSON.stringify({ error: `Not found: ${pathname}` }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};
