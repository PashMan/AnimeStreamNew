// functions/api/balancer.ts

interface AnimegoData {
  animegoId: string;
  aniboomMap: { voice: string; url: string; episodesCount?: number }[];
  defaultAniboomUrl: string;
  quality?: string;
  totalEpisodes?: number;
}

const animegoCache = new Map<string, AnimegoData>();

const KNOWN_ANIMEGO_MAPPINGS: Record<string, AnimegoData> = {
  // Re:Zero 4th Season (Жизнь в альтернативном мире с нуля 4) - AnimeGO 3279
  "61316": {
    animegoId: "3279",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/38kMR9yqEO4?episode=1&translation=2", episodesCount: 16 },
      { voice: "Dream Cast", url: "https://aniboom.one/embed/38kMR9yqEO4?episode=1&translation=30", episodesCount: 16 },
      { voice: "AniMaunt", url: "https://aniboom.one/embed/38kMR9yqEO4?episode=1&translation=46", episodesCount: 16 }
    ],
    defaultAniboomUrl: "https://aniboom.one/embed/38kMR9yqEO4?episode=1&translation=2",
    quality: "1080",
    totalEpisodes: 16
  },
  // Re:Zero 3rd Season (Жизнь в альтернативном мире с нуля 3) - AnimeGO 2680
  "54857": {
    animegoId: "2680",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/9ZLq9l4dN5G?episode=1&translation=2", episodesCount: 8 },
      { voice: "Studio Band", url: "https://aniboom.one/embed/9ZLq9l4dN5G?episode=1&translation=16", episodesCount: 8 }
    ],
    defaultAniboomUrl: "https://aniboom.one/embed/9ZLq9l4dN5G?episode=1&translation=2",
    quality: "1080",
    totalEpisodes: 8
  },
  // Mushoku Tensei: Isekai Ittara Honki Dasu (Season 1) - AnimeGO 1718
  "39535": {
    animegoId: "1718",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=2", episodesCount: 11 },
      { voice: "Studio Band", url: "https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=16", episodesCount: 11 }
    ],
    defaultAniboomUrl: "https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=2",
    quality: "1080",
    totalEpisodes: 11
  },
  // Mushoku Tensei: Isekai Ittara Honki Dasu Part 2 - AnimeGO 1845
  "45576": {
    animegoId: "1845",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=2", episodesCount: 12 },
      { voice: "Studio Band", url: "https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=16", episodesCount: 12 }
    ],
    defaultAniboomUrl: "https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=2",
    quality: "1080",
    totalEpisodes: 12
  },
  // Mushoku Tensei II: Isekai Ittara Honki Dasu - AnimeGO 2292
  "51179": {
    animegoId: "2292",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=2", episodesCount: 12 },
      { voice: "Studio Band", url: "https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=16", episodesCount: 12 }
    ],
    defaultAniboomUrl: "https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=2",
    quality: "1080",
    totalEpisodes: 12
  },
  // Mushoku Tensei: Eris the Goblin Slayer OVA - AnimeGO 2035
  "49926": {
    animegoId: "2035",
    aniboomMap: [
      { voice: "Studio Band", url: "https://aniboom.one/embed/k8Rq2b08awe?episode=1&translation=16", episodesCount: 1 }
    ],
    defaultAniboomUrl: "https://aniboom.one/embed/k8Rq2b08awe?episode=1&translation=16",
    quality: "1080",
    totalEpisodes: 1
  }
};

// Shikimori IDs that MUST NOT query AniBoom (e.g. unreleased seasons like 59193 Mushoku Tensei III)
const ANIBOOM_BLACKLIST_SHIKIMORI_IDS = new Set(["59193", "55888"]);

function cyrillicToTranslit(str: string): string {
  const ruMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
    'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };
  return str.toLowerCase().split('').map(char => ruMap[char] || char).join('');
}

const COMMON_STOP_WORDS = new Set([
  'v', 'na', 'o', 'ob', 'i', 's', 'po', 'dlya', 'ot', 'do', 'iz', 'k', 'zhe', 'to', 'kak', 'eto',
  'drugom', 'mire', 'drugoy', 'mir', 'istoriya', 'priklyucheniya', 'priklyucheniyah', 'sezon', 'chast',
  'film', 'tv', 'anime', 'the', 'a', 'an', 'in', 'on', 'of', 'to', 'for', 'and', 'or', 'is', 'it',
  'season', 'part', 'movie', 'ova', 'isekai', 'world', 'another', 'tale', 'story', 'no', 'ni', 'wa', 'ga',
  'в', 'на', 'о', 'об', 'и', 'с', 'по', 'для', 'от', 'до', 'из', 'к', 'же', 'то', 'как', 'это',
  'другом', 'мире', 'другой', 'мир', 'история', 'приключения', 'приключениях', 'сезон', 'часть', 'фильм'
]);

function isCandidateRelevant(candPath: string, queries: string[]): boolean {
  const normPath = candPath.toLowerCase().replace(/[^a-z0-9]/g, '-');
  for (const q of queries) {
    const rawWords = q.toLowerCase().split(/[^a-z0-9а-яё]+/i).filter(w => w.length >= 3);
    const meaningfulWords = rawWords.filter(w => !COMMON_STOP_WORDS.has(w) && !COMMON_STOP_WORDS.has(cyrillicToTranslit(w)));
    
    if (meaningfulWords.length === 0) continue;
    
    let matched = 0;
    for (const w of meaningfulWords) {
      const translitW = cyrillicToTranslit(w);
      const rootRu = w.slice(0, Math.min(w.length, 5));
      const rootEn = translitW.slice(0, Math.min(translitW.length, 5));
      if (normPath.includes(rootRu) || (rootEn.length >= 3 && normPath.includes(rootEn))) {
        matched++;
      }
    }
    
    // Require matching at least 90% of meaningful words to avoid matching other anime
    const required = meaningfulWords.length <= 2 ? meaningfulWords.length : Math.ceil(meaningfulWords.length * 0.9);
    if (matched >= required && matched > 0) {
      return true;
    }
  }
  return false;
}

async function fetchAnimegoData(shikimoriId: string, searchTitle?: string): Promise<AnimegoData | null> {
  if (!shikimoriId) return null;
  if (ANIBOOM_BLACKLIST_SHIKIMORI_IDS.has(String(shikimoriId))) return null;
  if (KNOWN_ANIMEGO_MAPPINGS[shikimoriId]) return KNOWN_ANIMEGO_MAPPINGS[shikimoriId];
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
    if (!seenUrls.has(fullPath) && isCandidateRelevant(fullPath, searchQueries)) {
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
  const shikimori_id = url.searchParams.get('shikimori_id') || url.searchParams.get('id') || url.searchParams.get('shikimori');

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
            const itemQuality = res.quality
              ? (String(res.quality).toLowerCase().includes('p') ? String(res.quality) : `${res.quality}p`)
              : (res.link?.includes('1080') ? '1080p' : (res.link?.includes('480') ? '480p' : (res.link?.includes('360') ? '360p' : '720p')));

            if (!translationsMap.has(tName)) {
              translationsMap.set(tName, {
                id: res.translation.id,
                title: tName,
                type: res.translation.type || 'voice',
                iframe: iframe,
                episodes_count: epCount,
                last_episode: lastEp,
                quality: itemQuality,
                quality_label: itemQuality
              });
            } else {
              const existing = translationsMap.get(tName);
              existing.episodes_count = Math.max(existing.episodes_count, epCount);
              existing.last_episode = Math.max(existing.last_episode, lastEp);
              if (res.quality) {
                existing.quality = itemQuality;
                existing.quality_label = itemQuality;
              }
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
  let animego_total_episodes: number | undefined = undefined;

  const isAniboomBlacklisted = shikimori_id && ANIBOOM_BLACKLIST_SHIKIMORI_IDS.has(String(shikimori_id));

  if (shikimori_id && !isAniboomBlacklisted) {
    if (KNOWN_ANIMEGO_MAPPINGS[shikimori_id]) {
      const kData = KNOWN_ANIMEGO_MAPPINGS[shikimori_id];
      aniboom_iframe = kData.defaultAniboomUrl;
      animego_aniboom_map = kData.aniboomMap;
      animego_total_episodes = kData.totalEpisodes;
    } else if (context?.env?.DB) {
      try {
        const row: any = await context.env.DB.prepare(
          'SELECT aniboom_id, animego_slug, title_ru, aniboom_map FROM animego_catalog WHERE shikimori_id = ?'
        ).bind(shikimori_id).first();

        if (row?.aniboom_map) {
          const parsed = typeof row.aniboom_map === 'string' ? JSON.parse(row.aniboom_map) : row.aniboom_map;
          if (Array.isArray(parsed) && parsed.length > 0) {
            animego_aniboom_map = parsed;
            aniboom_iframe = parsed[0]?.url || (row.aniboom_id ? `https://aniboom.one/embed/${row.aniboom_id}` : null);
          }
        }
      } catch (_) {}
    }

    if (animego_aniboom_map.length === 0) {
      try {
        const animegoData = await fetchAnimegoData(String(shikimori_id), resolvedTitle || title || '');
        if (animegoData) {
          aniboom_iframe = animegoData.defaultAniboomUrl;
          animego_aniboom_map = animegoData.aniboomMap;
          animego_total_episodes = animegoData.totalEpisodes;
        }
      } catch (_) {}
    }
  }

  const players: any[] = [];
  if (aniboom_iframe) players.push({ name: 'Aniboom', iframe: aniboom_iframe });
  if (kodik_iframe) players.push({ name: 'Kodik', iframe: kodik_iframe });

  const normalizeVoice = (name: string) => (name || '').toLowerCase().replace(/[^a-zа-яё0-9]/gi, '').replace(/ё/g, 'е').trim();
  const cleanTitle = (raw: string) => raw.replace(/\s*\((4K|1080|720|4к|1080p|720p)\)\s*/gi, '').trim();

  const unifiedTranslations: any[] = [];

  if (animego_aniboom_map.length > 0) {
    animego_aniboom_map.forEach((ab, idx) => {
      const baseVoice = cleanTitle(ab.voice);
      const normAb = normalizeVoice(baseVoice);

      // Find matching Kodik translation
      const matchedKt = kodik_translations.find((kt: any) => {
        const normKt = normalizeVoice(cleanTitle(kt.title || ''));
        return normKt === normAb || normKt.includes(normAb) || normAb.includes(normKt);
      });

      const maxEpisodes = Math.max(
        ab.episodesCount || 0,
        animego_total_episodes || 0,
        matchedKt?.episodes_count || 0,
        matchedKt?.last_episode || 0,
        1
      );

      unifiedTranslations.push({
        id: `aniboom_${idx}_${normAb}`,
        title: baseVoice,
        type: 'voice',
        provider: 'AniBoom',
        iframe: ab.url,
        aniboom_iframe: ab.url,
        kodik_iframe: matchedKt?.iframe || (kodik_iframe || null),
        episodes_count: maxEpisodes,
        last_episode: maxEpisodes,
        quality_label: '4K',
        is_native_4k: true
      });
    });
  }

  // Include Kodik translations if not already matched
  if (kodik_translations && kodik_translations.length > 0) {
    kodik_translations.forEach((kt: any, idx: number) => {
      const baseVoice = cleanTitle(kt.title || '');
      const normKt = normalizeVoice(baseVoice);
      const maxEpisodes = Math.max(
        kt.episodes_count || 1,
        kt.last_episode || 1,
        1
      );

      const alreadyInUnified = unifiedTranslations.some((ut: any) => {
        const normUt = normalizeVoice(ut.title);
        return normUt === normKt || normUt.includes(normKt) || normKt.includes(normUt);
      });

      if (!alreadyInUnified) {
        unifiedTranslations.push({
          id: kt.id ? `kodik_${kt.id}` : `kodik_${idx}_${normKt}`,
          title: baseVoice,
          type: kt.type || 'voice',
          provider: 'Kodik',
          iframe: kt.iframe,
          aniboom_iframe: aniboom_iframe || null,
          kodik_iframe: kt.iframe,
          episodes_count: maxEpisodes,
          last_episode: maxEpisodes,
          quality_label: kt.quality || kt.quality_label || '720p',
          is_native_4k: false
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
