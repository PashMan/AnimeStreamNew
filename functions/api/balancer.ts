export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  const title = url.searchParams.get('title');
  const year = url.searchParams.get('year');
  const shikimori_id = url.searchParams.get('shikimori_id');

  // Helper to normalize strings for comparison
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]/g, '');
  const targetTitle = title ? normalize(title) : '';

  if (!title && !shikimori_id) {
    return new Response(JSON.stringify({ error: 'Title or Shikimori ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const players: any[] = [
    { name: 'Kodik', iframe: null },
    { name: 'Collaps', iframe: null }
  ];
  
  let kinopoisk_id: string | null = null;
  let imdb_id: string | null = null;
  let world_art_id: string | null = null;

  // Helper to validate result title
  const isValidResult = (resultTitle: string) => {
    if (!targetTitle) return true;
    const normalizedResult = normalize(resultTitle);
    return normalizedResult.includes(targetTitle) || targetTitle.includes(normalizedResult);
  };

  const ids = {
    shikimori_id,
    kinopoisk_id: null as string | null,
    imdb_id: null as string | null,
    world_art_id: null as string | null
  };

  let kodik_translations: any[] = [];

  // 1. Kodik
  try {
    const kodikUrl = `https://kodik-api.com/search?token=17cc4ee691bc251131a9041e6e89e78e&${shikimori_id ? `shikimori_id=${shikimori_id}` : `title=${encodeURIComponent(String(title))}`}&with_material_data=true`;
    const kodikRes = await fetch(kodikUrl);
    const kodikData = await kodikRes.json();
    if (kodikData.results && kodikData.results.length > 0) {
      const resultWithIds = kodikData.results.find((r: any) => r.kinopoisk_id || r.imdb_id || r.worldart_id);
      if (resultWithIds) {
        kinopoisk_id = resultWithIds.kinopoisk_id || null;
        imdb_id = resultWithIds.imdb_id || null;
        world_art_id = resultWithIds.worldart_id || null;
        ids.kinopoisk_id = kinopoisk_id;
        ids.imdb_id = imdb_id;
        ids.world_art_id = world_art_id;
      }

      // Group and collect unique translations from Kodik results
      const translationsMap = new Map();
      kodikData.results.forEach((res: any) => {
        if (res.translation && res.translation.title) {
          const tName = res.translation.title;
          const iframe = res.link.startsWith('//') ? `https:${res.link}` : res.link;
          if (!translationsMap.has(tName)) {
            translationsMap.set(tName, {
              id: res.translation.id,
              title: tName,
              type: res.translation.type,
              iframe: iframe
            });
          }
        }
      });
      kodik_translations = Array.from(translationsMap.values());

      const res = kodikData.results[0];
      const kodikPlayer = players.find(p => p.name === 'Kodik');
      if (kodikPlayer) {
        kodikPlayer.iframe = res.link.startsWith('//') ? `https:${res.link}` : res.link;
      }
    }
  } catch (e) {}

  let collaps_info: { iframe: string; has1080: boolean; epCount: number } | null = null;

  // 2. Collaps
  try {
    let collapsUrl = '';
    if (kinopoisk_id) {
      collapsUrl = `https://apicollaps.cc/list?token=eedefb541aeba871dcfc756e6b31c02e&kinopoisk_id=${kinopoisk_id}`;
    } else if (imdb_id) {
      collapsUrl = `https://apicollaps.cc/list?token=eedefb541aeba871dcfc756e6b31c02e&imdb_id=${imdb_id}`;
    } else if (title) {
      collapsUrl = `https://apicollaps.cc/list?token=eedefb541aeba871dcfc756e6b31c02e&name=${encodeURIComponent(title)}`;
    }

    if (collapsUrl) {
      const collapsRes = await fetch(collapsUrl);
      if (collapsRes.ok) {
        const collapsData = await collapsRes.json() as any;
        if (collapsData.results && collapsData.results.length > 0 && collapsData.results[0].iframe_url) {
          const item = collapsData.results[0];
          const collapsPlayer = players.find(p => p.name === 'Collaps');
          if (collapsPlayer) {
            collapsPlayer.iframe = item.iframe_url;
          }

          const qualStr = String(item.quality || '').toLowerCase();
          const has1080 = qualStr.includes('1080') || qualStr.includes('fhd') || qualStr.includes('4k') || qualStr.includes('2160');

          let epCount = 1;
          if (item.seasons && Array.isArray(item.seasons) && item.seasons.length > 0) {
            const lastSeason = item.seasons[item.seasons.length - 1];
            if (lastSeason.episodes && Array.isArray(lastSeason.episodes)) {
              epCount = lastSeason.episodes.length;
            }
          }

          collaps_info = {
            iframe: item.iframe_url,
            has1080,
            epCount
          };
        }
      }
    }
  } catch (e: any) {}

  // Merge Kodik and Collaps translations
  if (collaps_info) {
    const badge = collaps_info.has1080 ? '4K' : '1080';
    if (kodik_translations && kodik_translations.length > 0) {
      kodik_translations = kodik_translations.map((t: any) => {
        const baseTitle = t.title.replace(/\s*\((4K|1080)\)\s*/gi, '').trim();
        return {
          ...t,
          title: `${baseTitle} (${badge})`,
          has_1080_collaps: collaps_info!.has1080,
          collaps_iframe: collaps_info!.iframe,
          kodik_iframe: t.iframe,
          collaps_episodes_count: collaps_info!.epCount,
          kodik_episodes_count: t.episodes_count || 1,
          episodes_count: Math.max(collaps_info!.epCount, t.episodes_count || 1),
          last_episode: Math.max(collaps_info!.epCount, t.last_episode || 1),
          quality_label: badge
        };
      });
    } else {
      kodik_translations = [{
        id: 'collaps_main',
        title: `Collaps (${badge})`,
        type: 'voice',
        provider: 'Collaps',
        iframe: collaps_info.iframe,
        has_1080_collaps: collaps_info.has1080,
        collaps_iframe: collaps_info.iframe,
        kodik_iframe: null,
        collaps_episodes_count: collaps_info.epCount,
        kodik_episodes_count: 0,
        episodes_count: collaps_info.epCount,
        last_episode: collaps_info.epCount,
        quality_label: badge
      }];
    }
  } else if (kodik_translations && kodik_translations.length > 0) {
    kodik_translations = kodik_translations.map((t: any) => {
      const baseTitle = t.title.replace(/\s*\((4K|1080)\)\s*/gi, '').trim();
      return {
        ...t,
        title: `${baseTitle} (1080)`,
        has_1080_collaps: false,
        collaps_iframe: null,
        kodik_iframe: t.iframe,
        kodik_episodes_count: t.episodes_count || 1,
        quality_label: '1080'
      };
    });
  }

  return new Response(JSON.stringify({ players, ids, kodik_translations }), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300' // Cache for 5 minutes
    }
  });
}
