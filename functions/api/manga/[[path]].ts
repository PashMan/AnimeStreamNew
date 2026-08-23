import { checkIsMangaLicensed, LICENSED_MANGA_LIST } from '../../data/licensedManga';

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

  const cleanMangaTitle = (s: string): string => {
    if (!s) return "";
    return s
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s*[\(\[\{][^\)\]\}]*[\)\]\}]\s*/g, " ")
      .replace(/\b(манга|манхва|маньхуа|вебтун|веб комикс|manga|manhwa|manhua|webtoon|webcomic|онгоинг|ongoing|сериал|сезон|season|tv|тв|ремейк|remake|дубляж|перевод|official|release|глава|chapter|vol|volume|том)\b/gi, " ")
      .replace(/[^a-zа-я0-9]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const normalizeMangaTitle = (s: string): string => {
    return cleanMangaTitle(s);
  };

  const getTitleTokens = (s: string): string[] => {
    const cleaned = cleanMangaTitle(s);
    if (!cleaned) return [];
    return cleaned.split(/\s+/).filter(w => w.length > 0);
  };

  const CONFLICT_MARKERS = [
    'ragnarok', 'рагнарек', 'origin', 'ориджин', 'история', 'side story', 'sidestory',
    'special', 'спецвыпуск', 'экстра', 'extra', 'gaiden', 'гайден', 'гайдэн', 'хроники', 'chronicles',
    'академия', 'academy', 'альтернатива', 'alternate', 'перерождение', 'reincarnation', 'isekai',
    'школа', 'school', 'chibi', 'чиби', 'мини', 'mini', 'doujinshi', 'додзинси', 'антология', 'anthology'
  ];

  const scoreTitleMatch = (candidateTitles: (string | undefined)[], searchTerms: (string | undefined)[]): number => {
    let bestScore = 0;

    for (const term of searchTerms) {
      if (!term) continue;
      const cleanTerm = cleanMangaTitle(term);
      if (!cleanTerm || cleanTerm.length < 2) continue;
      const termTokens = getTitleTokens(term);
      const termSet = new Set(termTokens);

      for (const rawCand of candidateTitles) {
        if (!rawCand) continue;
        const cleanCand = cleanMangaTitle(rawCand);
        if (!cleanCand || cleanCand.length < 2) continue;
        const candTokens = getTitleTokens(rawCand);
        const candSet = new Set(candTokens);

        if (cleanCand === cleanTerm) {
          bestScore = Math.max(bestScore, 1000);
          continue;
        }

        let hasConflict = false;
        for (const marker of CONFLICT_MARKERS) {
          const markerClean = cleanMangaTitle(marker);
          const inCand = cleanCand.includes(markerClean);
          const inTerm = cleanTerm.includes(markerClean);
          if (inCand !== inTerm) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) continue;

        const termNumbers = termTokens.filter(t => /^\d+$/.test(t));
        const candNumbers = candTokens.filter(t => /^\d+$/.test(t));
        if (termNumbers.join(',') !== candNumbers.join(',')) continue;

        if (candTokens.length === termTokens.length && candTokens.every(t => termSet.has(t))) {
          bestScore = Math.max(bestScore, 950);
          continue;
        }

        let matchCount = 0;
        for (const t of candTokens) {
          if (termSet.has(t)) matchCount++;
        }

        const totalUnique = new Set([...termTokens, ...candTokens]).size;
        const dice = (termTokens.length + candTokens.length) > 0 
          ? (2 * matchCount) / (termTokens.length + candTokens.length) 
          : 0;

        const isPrefix = cleanCand.startsWith(cleanTerm) || cleanTerm.startsWith(cleanCand);
        const lengthRatio = Math.min(cleanCand.length, cleanTerm.length) / Math.max(cleanCand.length, cleanTerm.length);

        if (dice >= 0.85 && lengthRatio >= 0.75) {
          bestScore = Math.max(bestScore, Math.round(800 + dice * 150));
        } else if (isPrefix && lengthRatio >= 0.8 && dice >= 0.75) {
          bestScore = Math.max(bestScore, Math.round(750 + lengthRatio * 150));
        } else if (dice >= 0.80 && lengthRatio >= 0.70) {
          bestScore = Math.max(bestScore, 750);
        }
      }
    }

    return bestScore;
  };

  const findBestMangaDexMatch = async (searchTitles: string[]): Promise<string> => {
    let bestId = '';
    let highestScore = 0;

    for (const title of searchTitles) {
      if (!title || title.trim().length < 2) continue;
      try {
        const cleanT = cleanMangaTitle(title);
        if (!cleanT) continue;
        const mdSearchUrl = `https://api.mangadex.org/manga?limit=10&title=${encodeURIComponent(cleanT)}`;
        const mdRes = await fetch(mdSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const mdData: any = (mdRes.ok && mdRes.headers.get('content-type')?.includes('application/json')) ? await mdRes.json() : null;
        if (mdData && mdData.data && Array.isArray(mdData.data)) {
          for (const item of mdData.data) {
            const candTitles: string[] = [];
            if (item.attributes?.title) {
              candTitles.push(...Object.values(item.attributes.title) as string[]);
            }
            if (Array.isArray(item.attributes?.altTitles)) {
              for (const alt of item.attributes.altTitles) {
                candTitles.push(...Object.values(alt) as string[]);
              }
            }
            const score = scoreTitleMatch(candTitles, searchTitles);
            if (score >= 750 && score > highestScore) {
              highestScore = score;
              bestId = item.id;
            }
          }
        }
      } catch (err) {}
      if (highestScore >= 1000) break;
    }

    return highestScore >= 750 ? bestId : '';
  };

  const parseJsArray = (str: string): any[] | null => {
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) {}
    try {
      const jsonLike = str
        .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (m, g1) => JSON.stringify(g1.replace(/\\'/g, "'")))
        .replace(/,\s*([\]}])/g, "$1");
      return JSON.parse(jsonLike);
    } catch (e) {}
    return null;
  };

  const extractStringUrl = (item: any): string => {
    if (!item) return '';
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) {
      for (const elem of item) {
        if (typeof elem === 'string' && (elem.startsWith('/') || elem.startsWith('http'))) return elem;
      }
      return typeof item[2] === 'string' ? item[2] : (typeof item[0] === 'string' ? item[0] : '');
    }
    if (typeof item === 'object' && item !== null) {
      const candidate = item.link || item.url || item.image || item.photo || item.src || item.path;
      if (typeof candidate === 'string') return candidate;
      if (typeof candidate === 'object' && candidate !== null) return extractStringUrl(candidate);
    }
    return '';
  };

  const findZazaSuggestions = async (searchTitles: string[]): Promise<string[]> => {
    const links: string[] = [];
    for (const title of searchTitles) {
      if (!title || title.trim().length < 2) continue;
      try {
        const cleanT = cleanMangaTitle(title);
        if (!cleanT || cleanT.length < 2) continue;
        const res = await fetch('https://a.zazaza.me/search/suggestion?query=' + encodeURIComponent(cleanT));
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const suggData: any = await res.json();
          if (suggData && Array.isArray(suggData.suggestions)) {
            for (const s of suggData.suggestions) {
              if (s.link && !links.includes(s.link)) {
                const sTitles = [s.value, s.names ? s.names.join(' ') : ''].filter(Boolean);
                const score = scoreTitleMatch(sTitles, searchTitles);
                if (score >= 750) {
                  links.push(s.link);
                }
              }
            }
          }
        }
      } catch (e) {}
    }
    return links;
  };

  const findBestZazaSuggestion = async (searchTitles: string[]): Promise<string> => {
    const links = await findZazaSuggestions(searchTitles);
    return links[0] || '';
  };

  function extractMangaChanPages(html: string): string[] {
    if (!html) return [];
    const arrayMatches = html.match(/\[\s*["']https?:\/\/[^\]]+\]/gi) || [];
    for (const arrStr of arrayMatches) {
      if (arrStr.includes('thumbs') || arrStr.includes('manganew_thumbs')) continue;
      const cleaned = arrStr.replace(/,\s*\]/g, ']');
      try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const res = parsed.filter((u: any) => typeof u === 'string' && u.startsWith('http') && !u.includes('thumbs'));
          if (res.length > 0) return res;
        }
      } catch (e) {
        const urlMatches = Array.from(cleaned.matchAll(/https?:\/\/[^'"\s,]+\.(?:jpg|jpeg|png|webp)/gi)).map(m => m[0]);
        const filtered = urlMatches.filter(u => !u.includes('thumbs'));
        if (filtered.length > 0) return filtered;
      }
    }
    const globalMatches = Array.from(html.matchAll(/(https?:\/\/(?:img\d*|im\d*)\.manga-chan\.me\/manganew\/[^'"\s,]+\.(?:jpg|jpeg|png|webp))/gi)).map(m => m[1]);
    const filteredGlobal = Array.from(new Set(globalMatches)).filter(u => !u.includes('thumbs'));
    return filteredGlobal;
  }

  const fetchMangaChanChapters = async (searchTitles: string[]): Promise<any[]> => {
    for (const title of searchTitles) {
      if (!title || title.trim().length < 2) continue;
      try {
        const cleanT = cleanMangaTitle(title);
        if (!cleanT || cleanT.length < 2) continue;
        const searchUrl = `https://manga-chan.me/?do=search&subaction=search&story=${encodeURIComponent(cleanT)}`;
        const searchRes = await fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });
        if (!searchRes.ok) continue;
        const searchHtml = await searchRes.text();
        const mangaMatches = Array.from(searchHtml.matchAll(/<h2><a href=['"](https?:\/\/(?:im\.)?manga-chan\.me\/manga\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi));

        for (const mMatch of mangaMatches.slice(0, 5)) {
          const mangaUrl = mMatch[1];
          const rawMangaName = mMatch[2] ? mMatch[2].replace(/<[^>]+>/g, '').trim() : '';
          const score = scoreTitleMatch([rawMangaName], searchTitles);
          if (score < 750) continue;

          const mangaRes = await fetch(mangaUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
          });
          if (!mangaRes.ok) continue;
          const mangaHtml = await mangaRes.text();
          const chRegex = /href=['"](https?:\/\/(?:im\.)?manga-chan\.me\/online\/[^'"]+)['"]/gi;
          const chMatches = Array.from(mangaHtml.matchAll(chRegex)).map(m => m[1]);

          if (chMatches.length > 0) {
            const mcChapters: any[] = [];
            for (const chUrl of chMatches) {
              const chNumMatch = chUrl.match(/_ch([\d.]+)\.html/) || chUrl.match(/_v\d+_ch([\d.]+)/) || chUrl.match(/ch([\d.]+)/);
              const volMatch = chUrl.match(/_v(\d+)_/);
              const chapterNum = chNumMatch ? chNumMatch[1] : '0';
              const volNum = volMatch ? volMatch[1] : '1';
              mcChapters.push({
                id: `mc-${btoa(chUrl)}`,
                chapter: chapterNum,
                volume: volNum,
                title: `Глава ${chapterNum}`,
                group: 'Manga-Chan',
                publishAt: new Date().toISOString()
              });
            }
            return mcChapters;
          }
        }
      } catch (e) {}
    }
    return [];
  };

  const resolveFallbackPages = async (
    searchTitles: string[],
    targetChapNum: string,
    debugLogs?: string[]
  ): Promise<string[]> => {
    const titles = searchTitles.filter(Boolean);
    if (!titles.length) return [];

    // 1. Try ZazaZa / ReadManga suggestions
    const zazaLinks = await findZazaSuggestions(titles);
    for (const zazaLink of zazaLinks.slice(0, 3)) {
      try {
        const domain = zazaLink.startsWith('http') ? new URL(zazaLink).origin : 'https://a.zazaza.me';
        const path = zazaLink.startsWith('http') ? new URL(zazaLink).pathname : zazaLink;
        const mangaUrl = `${domain}${path}`;
        const res = await fetch(mangaUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) continue;
        const html = await res.text();

        const hrefRegex = /href=["']([^"']+)["']/gi;
        const links = Array.from(html.matchAll(hrefRegex)).map(m => m[1]);

        let matchedLink = '';
        for (const link of links) {
          const chMatch = link.match(/\/vol\d+\/([\d.,]+)/) || link.match(/_v\d+\/([\d.,]+)/) || link.match(/\/([\d.,]+)$/);
          if (chMatch) {
            const num = chMatch[1];
            if (String(num) === String(targetChapNum) || Math.abs(parseFloat(num) - parseFloat(targetChapNum)) < 0.01) {
              matchedLink = link;
              break;
            }
          }
        }

        if (matchedLink) {
          const chUrl = matchedLink.startsWith('http')
            ? (matchedLink.includes('?') ? `${matchedLink}&mtr=1` : `${matchedLink}?mtr=1`)
            : `${domain}${matchedLink.includes('?') ? matchedLink + '&mtr=1' : matchedLink + '?mtr=1'}`;
          const chRes = await fetch(chUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          if (chRes.ok) {
            const chHtml = await chRes.text();
            const pagesMatch = chHtml.match(/rm_h\.readerInit\([^,]*,\s*(\[\[.*?\]\])/);
            if (pagesMatch) {
              const rawPages = parseJsArray(pagesMatch[1]);
              if (Array.isArray(rawPages) && rawPages.length > 0) {
                let isDeleted = false;
                const pages = rawPages.map((p: any) => {
                  let host = Array.isArray(p) ? (typeof p[0] === 'string' ? p[0] : '') : '';
                  let pPath = Array.isArray(p) ? (typeof p[2] === 'string' ? p[2] : (typeof p[1] === 'string' ? p[1] : '')) : extractStringUrl(p);
                  let fullUrl = host && pPath ? `${host.replace(/\/$/, '')}/${pPath.replace(/^\//, '')}` : (pPath || host);
                  if (fullUrl.includes('deleted1.png')) isDeleted = true;
                  return fullUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(fullUrl)}&_zaza=1` : '';
                }).filter(Boolean);

                if (!isDeleted && pages.length > 0) {
                  if (debugLogs) debugLogs.push(`[fallback] Loaded ${pages.length} pages from ZazaZa`);
                  return pages;
                }
              }
            }
          }
        }
      } catch (e: any) {
        if (debugLogs) debugLogs.push(`[fallback] ZazaZa error: ${e.message}`);
      }
    }

    // 2. Try Manga-Chan (Unrestricted Russian manga source)
    for (const title of titles) {
      try {
        const cleanT = cleanMangaTitle(title);
        if (!cleanT || cleanT.length < 2) continue;
        const searchUrl = `https://manga-chan.me/?do=search&subaction=search&story=${encodeURIComponent(cleanT)}`;
        const searchRes = await fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (searchRes.ok) {
          const searchHtml = await searchRes.text();
          const mangaMatches = Array.from(searchHtml.matchAll(/<h2><a href=['"](https?:\/\/(?:im\.)?manga-chan\.me\/manga\/[^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi));
          for (const mMatch of mangaMatches.slice(0, 3)) {
            const mangaUrl = mMatch[1];
            const rawMangaName = mMatch[2] ? mMatch[2].replace(/<[^>]+>/g, '').trim() : '';
            const score = scoreTitleMatch([rawMangaName], titles);
            if (score < 750) continue;

            const mangaRes = await fetch(mangaUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            if (!mangaRes.ok) continue;
            const mangaHtml = await mangaRes.text();
            const chRegex = /href=['"](https?:\/\/(?:im\.)?manga-chan\.me\/online\/[^'"]+)['"]/gi;
            const chMatches = Array.from(mangaHtml.matchAll(chRegex)).map(m => m[1]);

            let matchedChUrl = '';
            for (const chUrl of chMatches) {
              const chNumMatch = chUrl.match(/_ch([\d.]+)\.html/) || chUrl.match(/_v\d+_ch([\d.]+)/) || chUrl.match(/ch([\d.]+)/);
              if (chNumMatch) {
                const num = chNumMatch[1];
                if (String(num) === String(targetChapNum) || Math.abs(parseFloat(num) - parseFloat(targetChapNum)) < 0.01) {
                  matchedChUrl = chUrl;
                  break;
                }
              }
            }

            if (matchedChUrl) {
              const chRes = await fetch(matchedChUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
              });
              if (chRes.ok) {
                const chHtml = await chRes.text();
                const pagesArr = extractMangaChanPages(chHtml);
                if (pagesArr.length > 0) {
                  const pages = pagesArr.map((imgUrl: string) => `/api/manga/page-proxy?url=${encodeURIComponent(imgUrl)}`);
                  if (debugLogs) debugLogs.push(`[fallback] Loaded ${pages.length} pages from Manga-Chan`);
                  return pages;
                }
              }
            }
          }
        }
      } catch (e: any) {
        if (debugLogs) debugLogs.push(`[fallback] Manga-Chan error: ${e.message}`);
      }
    }

    // 3. Try MangaDex
    for (const title of titles) {
      try {
        const cleanT = cleanMangaTitle(title);
        if (!cleanT || cleanT.length < 2) continue;
        const searchRes = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(cleanT)}&limit=5`);
        if (searchRes.ok) {
          const sJson: any = await searchRes.json();
          if (sJson.data && Array.isArray(sJson.data)) {
            for (const mangaItem of sJson.data) {
              const candTitles: string[] = [];
              if (mangaItem.attributes?.title) {
                candTitles.push(...Object.values(mangaItem.attributes.title) as string[]);
              }
              if (Array.isArray(mangaItem.attributes?.altTitles)) {
                for (const alt of mangaItem.attributes.altTitles) {
                  candTitles.push(...Object.values(alt) as string[]);
                }
              }
              const score = scoreTitleMatch(candTitles, titles);
              if (score < 750) continue;

              const mdId = mangaItem.id;
              const feedRes = await fetch(`https://api.mangadex.org/manga/${mdId}/feed?translatedLanguage[]=ru&translatedLanguage[]=en&limit=500&order[chapter]=asc`);
              if (feedRes.ok) {
                const feedData: any = await feedRes.json();
                if (feedData.data && Array.isArray(feedData.data)) {
                  const isNumMatch = (chNum: any) => String(chNum) === String(targetChapNum) || Math.abs(parseFloat(chNum || '0') - parseFloat(targetChapNum)) < 0.01;
                  const validChaps = feedData.data.filter((ch: any) => isNumMatch(ch.attributes?.chapter) && (ch.attributes?.pages > 0 && !ch.attributes?.externalUrl));

                  let matchedDex = validChaps.find((ch: any) => ch.attributes?.translatedLanguage === 'ru');
                  if (!matchedDex) matchedDex = validChaps.find((ch: any) => ch.attributes?.translatedLanguage === 'en');

                  if (matchedDex?.id) {
                    const srvRes = await fetch(`https://api.mangadex.org/at-home/server/${matchedDex.id}`);
                    if (srvRes.ok) {
                      const srvData: any = await srvRes.json();
                      if (srvData && srvData.chapter) {
                        const hash = srvData.chapter.hash;
                        const baseUrl = srvData.baseUrl;
                        const filenames = (srvData.chapter.data && srvData.chapter.data.length > 0) ? srvData.chapter.data : (srvData.chapter.dataSaver || []);
                        const pathPrefix = (srvData.chapter.data && srvData.chapter.data.length > 0) ? 'data' : 'data-saver';
                        const pages = filenames.map((fn: string) => `/api/manga/page-proxy?url=${encodeURIComponent(`${baseUrl}/${pathPrefix}/${hash}/${fn}`)}`);
                        if (pages.length > 0) {
                          if (debugLogs) debugLogs.push(`[fallback] Loaded ${pages.length} pages from MangaDex`);
                          return pages;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e: any) {
        if (debugLogs) debugLogs.push(`[fallback] MangaDex error: ${e.message}`);
      }
    }

    // 4. Try ReManga
    try {
      const cleanT = cleanMangaTitle(titles[0]);
      if (cleanT && cleanT.length >= 2) {
        const rmSearch = await fetch(`https://api.remanga.org/api/search/?query=${encodeURIComponent(cleanT)}&count=5`, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://remanga.org/' }
        });
        if (rmSearch.ok && rmSearch.headers.get('content-type')?.includes('application/json')) {
          const rmData: any = await rmSearch.json();
          if (rmData && Array.isArray(rmData.content)) {
            let matchedDir = '';
            let bestScore = 0;
            for (const item of rmData.content) {
              if (!item.dir) continue;
              const candTitles = [item.rus_name, item.en_name, item.dir.replace(/-/g, ' ')].filter(Boolean);
              const score = scoreTitleMatch(candTitles, titles);
              if (score >= 750 && score > bestScore) {
                bestScore = score;
                matchedDir = item.dir;
              }
            }

            if (matchedDir) {
              const dtRes = await fetch(`https://api.remanga.org/api/titles/${matchedDir}/`);
              if (dtRes.ok && dtRes.headers.get('content-type')?.includes('application/json')) {
                const dtData: any = await dtRes.json();
                const branchId = dtData?.content?.branches?.[0]?.id;
                if (branchId) {
                  const chRes = await fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branchId}&limit=250&page=1`);
                  if (chRes.ok && chRes.headers.get('content-type')?.includes('application/json')) {
                    const chData: any = await chRes.json();
                    const matchedCh = chData?.content?.find((ch: any) => String(ch.chapter) === String(targetChapNum) || Math.abs(parseFloat(ch.chapter) - parseFloat(targetChapNum)) < 0.1);
                    if (matchedCh?.id) {
                      const pRes = await fetch(`https://api.remanga.org/api/titles/chapters/${matchedCh.id}/`);
                      if (pRes.ok && pRes.headers.get('content-type')?.includes('application/json')) {
                        const pData: any = await pRes.json();
                        const cObj = pData?.content;
                        if (cObj?.pages || cObj?.scans) {
                          const servers = cObj.servers || ['https://img.remanga.org'];
                          const pageItems = cObj.pages || cObj.scans || [];
                          const pages = pageItems.map((page: any) => {
                            let link = extractStringUrl(page);
                            if (link && !link.startsWith('http')) {
                              const mainServer = servers[0] ? servers[0].replace(/\/$/, '') : 'https://img.remanga.org';
                              link = `${mainServer}${link.startsWith('/') ? link : '/' + link}`;
                            }
                            return link ? `/api/manga/page-proxy?url=${encodeURIComponent(link)}` : '';
                          }).filter(Boolean);

                          if (pages.length > 0) {
                            if (debugLogs) debugLogs.push(`[fallback] Loaded ${pages.length} pages from ReManga`);
                            return pages;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch(e: any) {
      if (debugLogs) debugLogs.push(`[fallback] ReManga error: ${e.message}`);
    }

    return [];
  };

  const extractBestMangaTitle = (attrs: any): { title: string; originalTitle: string } => {
    if (!attrs) return { title: 'Без названия', originalTitle: '' };

    const hasCyrillicOrLatin = (str: string) => /[a-zA-Zа-яА-ЯёЁ]/.test(str);

    let ruTitle = attrs.title?.ru;
    let enTitle = attrs.title?.en || attrs.title?.['ja-ro'];
    let altRu = '';
    let altEn = '';
    let altAnyLatinCyrillic = '';

    if (attrs.altTitles && Array.isArray(attrs.altTitles)) {
      for (const item of attrs.altTitles) {
        if (typeof item === 'object' && item !== null) {
          if (!altRu && item.ru) altRu = item.ru;
          if (!altEn && (item.en || item['ja-ro'])) altEn = item.en || item['ja-ro'];
          if (!altAnyLatinCyrillic) {
            const val = Object.values(item)[0];
            if (typeof val === 'string' && hasCyrillicOrLatin(val)) {
              altAnyLatinCyrillic = val;
            }
          }
        }
      }
    }

    let finalTitle = ruTitle || altRu || enTitle || altEn || altAnyLatinCyrillic;
    if (!finalTitle && attrs.title) {
      for (const val of Object.values(attrs.title)) {
        if (typeof val === 'string' && hasCyrillicOrLatin(val)) {
          finalTitle = val;
          break;
        }
      }
      if (!finalTitle) {
        finalTitle = (Object.values(attrs.title)[0] as string) || 'Без названия';
      }
    }

    const originalTitle = attrs.title?.['ja-ro'] || attrs.title?.ja || attrs.title?.en || attrs.title?.ko || '';

    return { title: finalTitle || 'Без названия', originalTitle };
  };

  const mergeAndDeduplicateChapters = (allChapters: any[]): any[] => {
    const chapterMap = new Map<string, any>();

    for (const ch of allChapters) {
      if (!ch || ch.chapter === undefined || ch.chapter === null) continue;
      const rawChapterStr = String(ch.chapter).trim();
      if (!rawChapterStr) continue;

      const parsedNum = parseFloat(rawChapterStr);
      const numKey = isNaN(parsedNum) ? rawChapterStr : String(parsedNum);

      if (!chapterMap.has(numKey)) {
        chapterMap.set(numKey, {
          ...ch,
          chapter: rawChapterStr
        });
      } else {
        const existing = chapterMap.get(numKey)!;
        const existingTitle = (existing.title || '').trim();
        const newTitle = (ch.title || '').trim();

        const existingIsGeneric = !existingTitle || existingTitle === 'Глава' || existingTitle === `Глава ${rawChapterStr}` || existingTitle === `Глава ${existing.chapter}`;
        const newIsGeneric = !newTitle || newTitle === 'Глава' || newTitle === `Глава ${rawChapterStr}` || newTitle === `Глава ${ch.chapter}`;

        if (existingIsGeneric && !newIsGeneric) {
          existing.title = newTitle;
        }

        if (!existing.volume && ch.volume) {
          existing.volume = ch.volume;
        }
      }
    }

    const merged = Array.from(chapterMap.values());
    merged.sort((a, b) => {
      const numA = parseFloat(a.chapter) || 0;
      const numB = parseFloat(b.chapter) || 0;
      return numA - numB;
    });

    return merged;
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
      } else if (targetUrl.includes('manga-chan.me') || targetUrl.includes('img7.manga-chan.me') || targetUrl.includes('im.manga-chan.me')) {
        referer = 'https://manga-chan.me/';
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

      if (!res.ok && (targetUrl.includes('shikimori.one') || targetUrl.includes('shikimori.me'))) {
        const altUrl = targetUrl.replace('shikimori.one', 'shikimori.me');
        try {
          const altRes = await fetch(altUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Referer': 'https://shikimori.me/'
            }
          });
          if (altRes.ok) res = altRes;
        } catch (e) {}
      }

      if (!res.ok) {
        const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600" fill="#18181b"><rect width="400" height="600" fill="#18181b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="16">Изображение недоступно</text></svg>`;
        return new Response(fallbackSvg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
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
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600" fill="#18181b"><rect width="400" height="600" fill="#18181b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#71717a" font-family="sans-serif" font-size="16">Изображение недоступно</text></svg>`;
      return new Response(fallbackSvg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' } });
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
          const { title, originalTitle } = extractBestMangaTitle(attrs);
          let description = attrs.description?.ru || attrs.description?.en || 'Описание манги KamiAnime';
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

      let shikiResults: any[] = [];
      if (shikiRes.status === 'fulfilled' && Array.isArray(shikiRes.value)) {
        shikiResults = shikiRes.value.map((m: any) => {
          const title = m.russian || m.name || 'Без названия';
          let cover = m.image?.original ? `/api/manga/page-proxy?url=${encodeURIComponent(`https://shikimori.one${m.image.original}`)}&_cb=3` : '';
          return {
            id: `shiki-${m.id}`,
            title,
            originalTitle: m.name || '',
            rating: m.score ? parseFloat(m.score) : 8.2,
            status: m.status === 'released' ? 'Завершен' : (m.status === 'ongoing' ? 'Онгоинг' : 'Анонс'),
            description: m.description || `Манга «${title}» (${m.name || ''}). Читать онлайн все главы на русском языке.`,
            cover,
            genres: [m.kind === 'manhwa' ? 'Манхва' : (m.kind === 'manhua' ? 'Маньхуа' : 'Манга')],
            chapters: m.chapters || m.volumes || 10
          };
        }).filter(Boolean);
      }

      let rmResults: any[] = [];
      if (rmRes.status === 'fulfilled' && rmRes.value && rmRes.value.content) {
        rmResults = rmRes.value.content.map((m: any) => {
          let title = m.rus_name || m.en_name || 'Без названия';
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

      const isLicensedItem = (item: any) => {
        if (!item) return false;
        return checkIsMangaLicensed([item.title, item.originalTitle, item.id]).isLicensed;
      };

      mdResults = mdResults.filter(item => !isLicensedItem(item));
      shikiResults = shikiResults.filter(item => !isLicensedItem(item));
      rmResults = rmResults.filter(item => !isLicensedItem(item));

      const seenTitles = new Set();
      const interleaved: any[] = [];
      const pushIfUnique = (item: any) => {
        if (!item || !item.title) return;
        if (isLicensedItem(item)) return;
        const canonical = item.title.toLowerCase().trim();
        if (!seenTitles.has(canonical)) {
          seenTitles.add(canonical);
          interleaved.push(item);
        }
      };

      const maxLength = Math.max(shikiResults.length, rmResults.length, mdResults.length);
      for (let i = 0; i < maxLength; i++) {
        if (i < shikiResults.length) pushIfUnique(shikiResults[i]);
        if (i < rmResults.length) pushIfUnique(rmResults[i]);
        if (i < mdResults.length) pushIfUnique(mdResults[i]);
      }

      if (query && checkIsMangaLicensed([query]).isLicensed) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
          }
        });
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
        if (checkIsMangaLicensed([mangaResponse.title, mangaResponse.originalTitle, mangaId, rawId]).isLicensed) {
          return new Response(JSON.stringify({ error: 'Манга официально лицензирована в РФ и полностью скрыта', isLicensed: true }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
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
        const title = m.russian || m.name;
        const originalTitle = m.name;
        if (checkIsMangaLicensed([title, originalTitle, mangaId, rawId]).isLicensed) {
          return new Response(JSON.stringify({ error: 'Манга официально лицензирована в РФ и полностью скрыта', isLicensed: true }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }
        const cover = m.image?.original ? `/api/manga/page-proxy?url=${encodeURIComponent(`https://shikimori.one${m.image.original}`)}&_cb=3` : 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80';
        return new Response(JSON.stringify({
          manga: {
            id: mangaId,
            title,
            originalTitle,
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
      const { title, originalTitle } = extractBestMangaTitle(attrs);
      if (checkIsMangaLicensed([title, originalTitle, mangaId]).isLicensed) {
        return new Response(JSON.stringify({ error: 'Манга официально лицензирована в РФ и полностью скрыта', isLicensed: true }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
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
          const mTitle = m.russian || m.name;
          if (checkIsMangaLicensed([mTitle, m.name, `shiki-${m.id}`]).isLicensed) {
            return null;
          }
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
        const mTitle = m.russian || m.name;
        if (checkIsMangaLicensed([mTitle, m.name, `shiki-${m.id}`]).isLicensed) {
          return null;
        }
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
      }).filter(Boolean) : [];

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
    const qTitle = url.searchParams.get('title');
    const qOrig = url.searchParams.get('orig');
    if (qTitle) searchTitles.push(qTitle);
    if (qOrig) searchTitles.push(qOrig);

    if (checkIsMangaLicensed([qTitle, qOrig, mangaId]).isLicensed) {
      return new Response(JSON.stringify({ chapters: [], isLicensed: true, message: 'Манга официально лицензирована в РФ и полностью скрыта.' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    let mdMangaId = mangaId;

    if (mangaId.startsWith('remanga-')) {
      const explicitRemangaDir = mangaId.replace('remanga-', '');
      searchTitles.push(explicitRemangaDir.replace(/-/g, ' '));
      
      const matched = await findBestMangaDexMatch(searchTitles);
      if (matched) mdMangaId = matched;
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

      const matched = await findBestMangaDexMatch(searchTitles);
      if (matched) mdMangaId = matched;
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
      let highestScore = 0;

      if (!remangaDir) {
        for (const title of uniqueQueryTitles) {
          if (!title || title.trim().length < 2) continue;
          try {
            const cleanT = cleanMangaTitle(title);
            if (!cleanT || cleanT.length < 2) continue;
            const sRes = await fetch(`https://api.remanga.org/api/search/?query=${encodeURIComponent(cleanT)}&count=5`, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://remanga.org/',
                'Accept': 'application/json, text/plain, */*'
              }
            });
            if (sRes.ok && sRes.headers.get('content-type')?.includes('application/json')) {
              const sData: any = await sRes.json();
              if (sData && Array.isArray(sData.content)) {
                for (const item of sData.content) {
                  if (!item.dir) continue;
                  const candTitles = [item.rus_name, item.en_name, item.dir.replace(/-/g, ' ')].filter(Boolean);
                  const score = scoreTitleMatch(candTitles, uniqueQueryTitles);
                  if (score >= 750 && score > highestScore) {
                    highestScore = score;
                    remangaDir = item.dir;
                  }
                }
              }
            }
          } catch(e) {}
          if (highestScore >= 1000) break;
        }
      }
      if (!remangaDir || (highestScore < 750 && !mangaId.startsWith('remanga-'))) return [];

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
            return data.data
              .filter((ch: any) => {
                const attrs = ch.attributes || {};
                return !attrs.externalUrl && (attrs.pages === undefined || attrs.pages > 0);
              })
              .map((ch: any) => {
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
      const zazaPath = await findBestZazaSuggestion(uniqueQueryTitles);
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
    const [rmList, mdList, zazaList, mcList] = await Promise.all([
      fetchRemangaChapters(),
      fetchMangaDexChapters(),
      fetchZazaChapters(),
      fetchMangaChanChapters(searchTitles)
    ]);

    const allChapters = [...mcList, ...rmList, ...mdList, ...zazaList];

    const filteredChapters = mergeAndDeduplicateChapters(allChapters);

    return new Response(JSON.stringify({ chapters: filteredChapters, isLicensed: false }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 2. PAGES FOR CHAPTER: /api/manga/chapter/:chapterId/pages
  const chapterPagesMatch = pathname.match(/^\/chapter\/(.+)\/pages\/?$/);
  if (chapterPagesMatch) {
    const chapterId = chapterPagesMatch[1];
    const reqTitle = url.searchParams.get('title') || '';
    const reqOrig = url.searchParams.get('orig') || '';
    const reqChTitle = url.searchParams.get('chTitle') || '';

    if (checkIsMangaLicensed([reqTitle, reqOrig, reqChTitle, chapterId]).isLicensed) {
      return new Response(JSON.stringify({ error: 'Манга официально лицензирована в РФ и полностью скрыта.', pages: [], isLicensed: true }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (chapterId.startsWith('mc-')) {
      const rawUrl = atob(chapterId.replace('mc-', ''));
      const debugLogs: string[] = [];
      try {
        const pageRes = await fetch(rawUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          const pagesArr = extractMangaChanPages(pageHtml);
          if (pagesArr.length > 0) {
            const pages = pagesArr.map((imgUrl: string) => `/api/manga/page-proxy?url=${encodeURIComponent(imgUrl)}`);
            return new Response(JSON.stringify({ pages, debugLogs, isLicensed: false }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
        }
      } catch (e) {}

      const reqTitle = url.searchParams.get('title') || '';
      const reqOrig = url.searchParams.get('orig') || '';
      const reqCh = url.searchParams.get('ch') || '';
      const reqChTitle = url.searchParams.get('chTitle') || '';
      const targetChapNum = reqCh || (reqChTitle.match(/([\d.,]+)/)?.[1] || '1');
      const fallbackTitles = [reqTitle, reqOrig].filter(Boolean);
      const fallbackPages = await resolveFallbackPages(fallbackTitles, targetChapNum, debugLogs);
      return new Response(JSON.stringify({ pages: fallbackPages, debugLogs, isLicensed: false }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

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
            debugLogs.push(`[zaza] Chapter is licensed/deleted on ReadManga (deleted1.png). Starting auto-fallback...`);
          }
        }

        const reqTitle = url.searchParams.get('title') || '';
        const reqOrig = url.searchParams.get('orig') || '';
        const reqCh = url.searchParams.get('ch') || '';
        const reqChTitle = url.searchParams.get('chTitle') || '';
        const pathPart = rawPath.split('?')[0];
        const matchVolChap = pathPart.match(/vol(\d+)\/([\d.,]+)/) || pathPart.match(/_v\d+\/([\d.,]+)/) || pathPart.match(/\/([\d.,]+)$/);
        const targetChapNum = reqCh || (matchVolChap ? matchVolChap[2] || matchVolChap[1] : (reqChTitle.match(/([\d.,]+)/)?.[1] || '1'));
        const rawSlug = pathPart.split('/')[1] || '';
        const cleanSlug = rawSlug.replace(/__.*$/, '').replace(/_/g, ' ').trim();

        const fallbackTitles = [reqTitle, reqOrig, cleanSlug].filter(Boolean);
        debugLogs.push(`[zaza-fallback] Searching alternative sources for titles "${fallbackTitles.join(', ')}" chapter ${targetChapNum}...`);

        const fallbackPages = await resolveFallbackPages(fallbackTitles, targetChapNum, debugLogs);
        if (fallbackPages.length > 0) {
          return new Response(JSON.stringify({ pages: fallbackPages, debugLogs, isFallback: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
        }

        return new Response(JSON.stringify({ error: 'Страницы этой главы временно недоступны на данном источнике. Выберите другую главу или перевод.', isLicensed: false, pages: [], debugLogs }), {
          status: 200,
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
            'Referer': 'https://remanga.org/',
            'Accept': 'application/json, text/plain, */*'
          }
        });
        if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
          const data: any = await res.json().catch(() => null);
          const cObj = data?.content;
          if (cObj) {
            const servers = cObj.servers || ['https://img.remanga.org'];
            const pageItems = cObj.pages || cObj.scans || cObj.images || [];
            const pages = pageItems.map((page: any) => {
              let link = "";
              if (typeof page === 'string') {
                link = page;
              } else if (page && typeof page === 'object') {
                if (Array.isArray(page)) {
                  link = page[2] || page[0] || "";
                } else {
                  link = page.link || page.url || page.image || page.photo || "";
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

            if (pages.length > 0) {
              return new Response(JSON.stringify({ pages, debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
            }
          }
        }
      } catch (err: any) {
        debugLogs.push(`[remanga] Fetch error: ${err.message}`);
      }

      // ReManga failed/blocked (403): perform fallback
      const reqTitle = url.searchParams.get('title') || '';
      const reqOrig = url.searchParams.get('orig') || '';
      const reqCh = url.searchParams.get('ch') || '';
      const reqChTitle = url.searchParams.get('chTitle') || '';
      const targetChapNum = reqCh || (reqChTitle.match(/([\d.,]+)/)?.[1] || '1');
      const fallbackTitles = [reqTitle, reqOrig].filter(Boolean);

      debugLogs.push(`[remanga-fallback] Starting multi-source fallback for "${fallbackTitles.join(', ')}" chapter ${targetChapNum}...`);
      const fallbackPages = await resolveFallbackPages(fallbackTitles, targetChapNum, debugLogs);
      if (fallbackPages.length > 0) {
        return new Response(JSON.stringify({ pages: fallbackPages, debugLogs, isFallback: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }

      return new Response(JSON.stringify({ pages: [], debugLogs, error: 'Не удалось получить страницы главы с ReManga или сторонних источников' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    const dexUrl = `https://api.mangadex.org/at-home/server/${chapterId}`;
    const debugLogs: string[] = [`[mangadex] Preparing fetch for DexChapterId ${chapterId}`];
    try {
      const res = await fetch(dexUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data: any = await res.json().catch(() => null);
        if (data && data.chapter) {
          const hash = data.chapter.hash;
          const baseUrl = data.baseUrl;
          const filenames = (data.chapter.data && data.chapter.data.length > 0) ? data.chapter.data : (data.chapter.dataSaver || []);
          const isDataSaver = (!data.chapter.data || data.chapter.data.length === 0) && !!data.chapter.dataSaver;
          const pathPrefix = isDataSaver ? 'data-saver' : 'data';
          const pages = filenames.map((filename: string) => {
            const rawUrl = `${baseUrl}/${pathPrefix}/${hash}/${filename}`;
            return `/api/manga/page-proxy?url=${encodeURIComponent(rawUrl)}&chapterId=${chapterId}`;
          });
          if (pages.length > 0) {
            return new Response(JSON.stringify({ pages, debugLogs }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
          }
        }
      }
    } catch(err: any) {
      debugLogs.push(`[mangadex] Fetch error: ${err.message}`);
    }

    // MangaDex failed: perform fallback
    const reqTitle = url.searchParams.get('title') || '';
    const reqOrig = url.searchParams.get('orig') || '';
    const reqCh = url.searchParams.get('ch') || '';
    const reqChTitle = url.searchParams.get('chTitle') || '';
    const targetChapNum = reqCh || (reqChTitle.match(/([\d.,]+)/)?.[1] || '1');
    const fallbackTitles = [reqTitle, reqOrig].filter(Boolean);

    debugLogs.push(`[mangadex-fallback] Starting fallback for "${fallbackTitles.join(', ')}" chapter ${targetChapNum}...`);
    const fallbackPages = await resolveFallbackPages(fallbackTitles, targetChapNum, debugLogs);
    if (fallbackPages.length > 0) {
      return new Response(JSON.stringify({ pages: fallbackPages, debugLogs, isFallback: true }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    return new Response(JSON.stringify({ pages: [], debugLogs, error: 'Страницы главы не найдены' }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  // Route not found
  return new Response(JSON.stringify({ error: `Not found: ${pathname}` }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};
