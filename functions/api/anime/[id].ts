// functions/api/anime/[id].ts

interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { params, env, request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  // 1. D1 EDGE CACHE (caches.default): Check if response is cached at Cloudflare Edge node
  const cache = (caches as any).default;
  const cacheKey = new Request(request.url, request);
  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  } catch (_) {}

  const rawId = params.id as string;
  const shikimoriId = rawId ? rawId.split('-')[0] : '';

  if (!shikimoriId) {
    return new Response(JSON.stringify({ error: 'shikimori_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const KNOWN_MAPPINGS: Record<string, any> = {
      "39535": { aniboom_id: "1718", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-1718", title_ru: "Реинкарнация безработного: История о приключениях в другом мире", aniboom_map: '[{"voice":"AniLibria","url":"https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=2"},{"voice":"Studio Band","url":"https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=16"}]' },
      "45576": { aniboom_id: "1845", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-chast-2-1845", title_ru: "Реинкарнация безработного: История о приключениях в другом мире. Часть 2", aniboom_map: '[{"voice":"AniLibria","url":"https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=2"},{"voice":"Studio Band","url":"https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=16"}]' },
      "51179": { aniboom_id: "2292", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-2292", title_ru: "Реинкарнация безработного: История о приключениях в другом мире 2", aniboom_map: '[{"voice":"AniLibria","url":"https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=2"},{"voice":"Studio Band","url":"https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=16"}]' },
      "55888": { aniboom_id: "2575", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575", title_ru: "Реинкарнация безработного: История о приключениях в другом мире 2. Часть 2", aniboom_map: '[{"voice":"AniLibria","url":"https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=2"},{"voice":"Studio Band","url":"https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=16"}]' },
      "59193": { aniboom_id: "2575", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575", title_ru: "Реинкарнация безработного: История о приключениях в другом мире 2. Часть 2", aniboom_map: '[{"voice":"AniLibria","url":"https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=2"},{"voice":"Studio Band","url":"https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=16"}]' },
      "49926": { aniboom_id: "2035", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-eris-ohota-na-goblinov-2035", title_ru: "Реинкарнация безработного: Эрис — охота на гоблинов", aniboom_map: '[{"voice":"Studio Band","url":"https://aniboom.one/embed/k8Rq2b08awe?episode=1&translation=16"}]' }
    };

    let row: any = null;
    if (env && env.DB) {
      row = await env.DB.prepare(
        'SELECT aniboom_id, animego_slug, title_ru, aniboom_map FROM animego_catalog WHERE shikimori_id = ?'
      ).bind(shikimoriId).first();
    }

    if (!row && KNOWN_MAPPINGS[shikimoriId]) {
      row = KNOWN_MAPPINGS[shikimoriId];
    }

    let aniboomVoices: any[] = [];
    if (row?.aniboom_map) {
      try {
        aniboomVoices = typeof row.aniboom_map === 'string' ? JSON.parse(row.aniboom_map) : row.aniboom_map;
      } catch (_) {}
    }

    // Если в D1 записей нет, пробуем получить из воркера парсера
    if (aniboomVoices.length === 0) {
      try {
        const parserRes = await fetch(`https://parser.oshxycfdjab.workers.dev/?shikimori_id=${shikimoriId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (parserRes.ok) {
          const parserData = await parserRes.json() as any;
          if (parserData?.voices && Array.isArray(parserData.voices)) {
            aniboomVoices = parserData.voices;
          }
        }
      } catch (_) {}
    }

    const finalResponse = new Response(JSON.stringify({
      shikimori_id: shikimoriId,
      aniboom_id: row?.aniboom_id || null,
      animego_slug: row?.animego_slug || null,
      title_ru: row?.title_ru || null,
      voices: aniboomVoices // [{ voice: "Дубляж", aniboom_id: "...", url: "..." }, ...]
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600, s-maxage=600'
      }
    });

    try {
      context.waitUntil(cache.put(cacheKey, finalResponse.clone()));
    } catch (_) {}

    return finalResponse;
  } catch (err: any) {
    return new Response(JSON.stringify({
      shikimori_id: shikimoriId,
      aniboom_id: null,
      voices: [],
      error: err.message
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
