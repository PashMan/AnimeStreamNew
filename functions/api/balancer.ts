// functions/api/balancer.ts

interface AnimegoData {
  animegoId: string;
  aniboomMap: { voice: string; url: string; episodesCount?: number }[];
  defaultAniboomUrl: string;
  quality?: string;
  totalEpisodes?: number;
}

const animegoCache = new Map<string, AnimegoData>();

async function fetchAnimegoData(shikimoriId: string, searchTitle?: string): Promise<AnimegoData | null> {
  if (!shikimoriId) return null;
  if (animegoCache.has(shikimoriId)) return animegoCache.get(shikimoriId)!;

  let ruTitle = searchTitle;
  let enTitle = '';
  let shikiEpisodesCount = 0;

  try {
    const shikiRes = await fetch(`https://shikimori.one/api/animes/${shikimoriId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://shikimori.one/'
      }
    });
    if (shikiRes.ok) {
      const shikiData: any = await shikiRes.json();
      if (shikiData) {
        if (shikiData.russian) ruTitle = shikiData.russian;
        if (shikiData.name) enTitle = shikiData.name;
        shikiEpisodesCount = shikiData.episodes_aired || shikiData.episodes || 0;
      }
    }
  } catch (_) {}

  const searchQueries = [ruTitle, enTitle].filter(Boolean) as string[];
  if (searchQueries.length === 0) return null;

  const domains = ['animego.me', 'animego.org'];
  let searchHtml = '';
  let activeDomain = 'animego.me';

  for (const queryTitle of searchQueries) {
    for (const domain of domains) {
      try {
        const res = await fetch(`https://${domain}/search/anime?q=${encodeURIComponent(queryTitle)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru,en-US;q=0.7,en;q=0.3'
          }
        });
        if (res.ok) {
          const html = await res.text();
          if (html.includes('/anime/')) {
            searchHtml = html;
            activeDomain = domain;
            break;
          }
        }
      } catch (_) {}
    }
    if (searchHtml) break;
  }

  if (!searchHtml) return null;

  const regex = /href="(?:\/|https?:\/\/[^\/]+\/)anime\/([a-z0-9-]+-([0-9]+))"/gi;
  const candidates: { path: string; id: string }[] = [];
  let match;
  const seenUrls = new Set<string>();

  while ((match = regex.exec(searchHtml)) !== null) {
    const fullPath = `/anime/${match[1]}`;
    if (!seenUrls.has(fullPath)) {
      seenUrls.add(fullPath);
      candidates.push({ path: fullPath, id: match[2] });
    }
  }

  let matchedAnimegoId: string | null = candidates[0]?.id || null;
  for (const cand of candidates.slice(0, 3)) {
    try {
      const res = await fetch(`https://${activeDomain}${cand.path}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      if (res.ok) {
        const detailHtml = await res.text();
        const isMatched = new RegExp(`shikimori\\.(one|io|org|me)\\/animes\\/${shikimoriId}\\b|\\b/animes/${shikimoriId}\\b`, 'i').test(detailHtml);
        if (isMatched) {
          matchedAnimegoId = cand.id;
          break;
        }
      }
    } catch (_) {}
  }

  if (!matchedAnimegoId) return null;

  let aniboomMap: { voice: string; url: string; episodesCount?: number }[] = [];
  let defaultAniboomUrl = '';

  try {
    const playerRes = await fetch(`https://${activeDomain}/player/${matchedAnimegoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://${activeDomain}/anime/slug-${matchedAnimegoId}`,
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      }
    });

    if (playerRes.ok) {
      const playerJson: any = await playerRes.json();
      const html = playerJson.data?.content || '';
      const buttonMatches = [...html.matchAll(/<[a-z0-9]+[^>]+data-player="([^"]+)"[^>]*>/gi)];

      for (const m of buttonMatches) {
        const fullTag = m[0];
        const rawPlayerUrl = m[1].replace(/&amp;/g, '&').replace(/\\/g, '');
        const providerTitle = fullTag.match(/data-provider-title="([^"]+)"/i)?.[1] ||
                              fullTag.match(/data-provider="([^"]+)"/i)?.[1];
        const translationTitle = fullTag.match(/data-translation-title="([^"]+)"/i)?.[1] ||
                                 fullTag.match(/data-dubbing-title="([^"]+)"/i)?.[1] ||
                                 fullTag.match(/data-translation="([^"]+)"/i)?.[1] ||
                                 fullTag.match(/data-voice="([^"]+)"/i)?.[1];

        if (providerTitle === 'AniBoom' || rawPlayerUrl.includes('aniboom')) {
          let cleanUrl = rawPlayerUrl.startsWith('//') ? 'https:' + rawPlayerUrl : rawPlayerUrl;
          if (translationTitle) {
            const voiceClean = translationTitle.trim();
            if (!aniboomMap.some(item => item.voice.toLowerCase() === voiceClean.toLowerCase())) {
              aniboomMap.push({ voice: voiceClean, url: cleanUrl, episodesCount: shikiEpisodesCount || undefined });
            }
          }
          if (!defaultAniboomUrl) defaultAniboomUrl = cleanUrl;
        }
      }
    }
  } catch (_) {}

  if (!defaultAniboomUrl && aniboomMap.length > 0) {
    defaultAniboomUrl = aniboomMap[0].url;
  }

  const result: AnimegoData = {
    animegoId: matchedAnimegoId,
    aniboomMap,
    defaultAniboomUrl,
    quality: '1080',
    totalEpisodes: shikiEpisodesCount || undefined
  };

  animegoCache.set(shikimoriId, result);
  return result;
}

export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const title = url.searchParams.get('title');
  const year = url.searchParams.get('year');
  const shikimori_id = url.searchParams.get('shikimori_id');

  if (!title && !shikimori_id) {
    return new Response(JSON.stringify({ error: 'Title or Shikimori ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  let kinopoisk_id: string | null = null;
  let imdb_id: string | null = null;
  let world_art_id: string | null = null;
  let kodik_translations: any[] = [];
  let kodik_iframe: string | null = null;

  let resolvedTitle = title;
  if (!resolvedTitle && shikimori_id) {
    try {
      const shikiRes = await fetch(`https://shikimori.one/api/animes/${shikimori_id}`);
      if (shikiRes.ok) {
        const shikiData: any = await shikiRes.json();
        resolvedTitle = shikiData.russian || shikiData.name;
      }
    } catch (_) {}
  }

  // 1. Kodik
  try {
    const kodikUrl = `https://kodik-api.com/search?token=17cc4ee691bc251131a9041e6e89e78e&${shikimori_id ? `shikimori_id=${shikimori_id}` : `title=${encodeURIComponent(String(title))}`}&with_material_data=true`;
    const kodikRes = await fetch(kodikUrl);
    if (kodikRes.ok) {
      const kodikData: any = await kodikRes.json();
      if (kodikData.results && kodikData.results.length > 0) {
        const resultWithIds = kodikData.results.find((r: any) => r.kinopoisk_id || r.imdb_id || r.worldart_id);
        if (resultWithIds) {
          kinopoisk_id = resultWithIds.kinopoisk_id || null;
          imdb_id = resultWithIds.imdb_id || null;
          world_art_id = resultWithIds.worldart_id || null;
        }

        const translationsMap = new Map();
        kodikData.results.forEach((res: any) => {
          if (res.translation && res.translation.title) {
            const tName = res.translation.title.trim();
            const iframe = res.link.startsWith('//') ? `https:${res.link}` : res.link;
            const epCount = res.episodes_count || res.last_episode || 1;
            const lastEp = res.last_episode || res.episodes_count || 1;

            if (!translationsMap.has(tName)) {
              translationsMap.set(tName, {
                id: res.translation.id,
                title: tName,
                type: res.translation.type || 'voice',
                iframe: iframe,
                episodes_count: epCount,
                last_episode: lastEp
              });
            }
          }
        });
        kodik_translations = Array.from(translationsMap.values());
        kodik_iframe = kodikData.results[0].link.startsWith('//') ? `https:${kodikData.results[0].link}` : kodikData.results[0].link;
      }
    }
  } catch (_) {}

  // 2. AnimeGO / AniBoom
  let aniboom_iframe: string | null = null;
  let animego_aniboom_map: Array<{ voice: string; url: string; episodesCount?: number }> = [];

  if (shikimori_id) {
    try {
      const animegoData = await fetchAnimegoData(String(shikimori_id), resolvedTitle || title || '');
      if (animegoData) {
        aniboom_iframe = animegoData.defaultAniboomUrl;
        animego_aniboom_map = animegoData.aniboomMap;
      }
    } catch (_) {}
  }

  const players: any[] = [];
  if (aniboom_iframe) players.push({ name: 'Aniboom', iframe: aniboom_iframe });
  if (kodik_iframe) players.push({ name: 'Kodik', iframe: kodik_iframe });

  const normalizeVoice = (name: string) => (name || '').toLowerCase().replace(/[^a-zа-яё0-9]/gi, '').replace(/ё/g, 'е').trim();
  const cleanTitle = (raw: string) => raw.replace(/\s*\((4K|1080|720|4к|1080p|720p)\)\s*/gi, '').trim();

  const matchedAnimegoVoices = new Set<string>();
  const unifiedTranslations: any[] = [];

  if (kodik_translations.length > 0) {
    kodik_translations.forEach((kt: any) => {
      const baseVoice = cleanTitle(kt.title || '');
      const normKt = normalizeVoice(baseVoice);

      let matchedAb: any = null;
      if (animego_aniboom_map.length > 0) {
        matchedAb = animego_aniboom_map.find(ab => {
          const normAb = normalizeVoice(ab.voice);
          return normAb === normKt || normAb.includes(normKt) || normKt.includes(normAb);
        }) || null;
      }

      if (matchedAb) {
        matchedAnimegoVoices.add(normalizeVoice(matchedAb.voice));
        unifiedTranslations.push({
          id: kt.id,
          title: baseVoice,
          type: kt.type || 'voice',
          provider: 'AniBoom',
          iframe: matchedAb.url,
          aniboom_iframe: matchedAb.url,
          kodik_iframe: kt.iframe,
          episodes_count: kt.episodes_count || 1,
          last_episode: kt.last_episode || 1,
          quality_label: '1080p'
        });
      } else {
        unifiedTranslations.push({
          id: kt.id,
          title: baseVoice,
          type: kt.type || 'voice',
          provider: 'Kodik',
          iframe: kt.iframe,
          aniboom_iframe: aniboom_iframe || null,
          kodik_iframe: kt.iframe,
          episodes_count: kt.episodes_count || 1,
          last_episode: kt.last_episode || 1,
          quality_label: '1080p'
        });
      }
    });
  }

  // Добавляем AniBoom озвучки, которых нет в Kodik
  if (animego_aniboom_map.length > 0) {
    animego_aniboom_map.forEach((ab, idx) => {
      const normAb = normalizeVoice(ab.voice);
      if (!matchedAnimegoVoices.has(normAb)) {
        unifiedTranslations.unshift({
          id: `aniboom_${idx}`,
          title: cleanTitle(ab.voice),
          type: 'voice',
          provider: 'AniBoom',
          iframe: ab.url,
          aniboom_iframe: ab.url,
          kodik_iframe: null,
          episodes_count: ab.episodesCount || 1,
          last_episode: ab.episodesCount || 1,
          quality_label: '1080p'
        });
      }
    });
  }

  return new Response(JSON.stringify({
    players,
    ids: { shikimori_id, kinopoisk_id, imdb_id, world_art_id },
    kodik_translations: unifiedTranslations.length > 0 ? unifiedTranslations : kodik_translations
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=60'
    }
  });
}