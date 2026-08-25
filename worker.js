/**
 * Cloudflare Worker: Shikimori ID to AniBoom Stream Resolver
 * Powered by Cloudflare D1 (animego_catalog) + Cloudflare Edge Cache
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const url = new URL(request.url);
    const shikimoriId = url.searchParams.get("shikimori_id");
    const episode = parseInt(url.searchParams.get("episode") || "1") || 1;
    const translation = url.searchParams.get("translation") || "16";

    // 2. Validate input
    if (!shikimoriId) {
      return new Response(
        JSON.stringify({
          source: "kodik_fallback",
          reason: "missing_shikimori_id",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 3. Cloudflare Edge Cache check (caches.default)
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      // Known verified fallback mappings if not yet synced in D1
      const KNOWN_MAPPINGS = {
        "61316": { aniboom_id: "38kMR9yqEO4", animego_slug: "re-zhizn-v-al-ternativnom-mire-s-nulya-4-3279", title_ru: "Re:Zero. Жизнь с нуля в альтернативном мире 4" },
        "54857": { aniboom_id: "9ZLq9l4dN5G", animego_slug: "re-zhizn-v-alternativnom-mire-s-nulya-3-2680", title_ru: "Re:Zero. Жизнь с нуля в альтернативном мире 3" },
        "39535": { aniboom_id: "1718", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-1718", title_ru: "Реинкарнация безработного: История о приключениях в другом мире" },
        "45576": { aniboom_id: "1845", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-chast-2-1845", title_ru: "Реинкарнация безработного: История о приключениях в другом мире. Часть 2" },
        "51179": { aniboom_id: "2292", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-2292", title_ru: "Реинкарнация безработного: История о приключениях в другом мире 2" },
        "49926": { aniboom_id: "2035", animego_slug: "reinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-eris-ohota-na-goblinov-2035", title_ru: "Реинкарнация безработного: Эрис — охота на гоблинов" }
      };

      // 4. Query Cloudflare D1 database (supports bindings DB, animego_catalog, DB_PROD)
      let result = null;
      const db = env.DB || env.animego_catalog || env.DB_PROD;
      if (db) {
        try {
          const query = "SELECT aniboom_id, animego_slug, title_ru FROM animego_catalog WHERE shikimori_id = ? LIMIT 1";
          result = await db.prepare(query).bind(shikimoriId).first();
        } catch (e) {
          console.warn("[Worker DB Warning]:", e);
        }
      }

      if (!result && KNOWN_MAPPINGS[shikimoriId]) {
        result = KNOWN_MAPPINGS[shikimoriId];
      }

      // 5. Handle missing title in D1 catalog -> clean Kodik fallback
      if (!result || !result.aniboom_id || !result.animego_slug) {
        const fallbackResponse = new Response(
          JSON.stringify({
            source: "kodik_fallback",
            reason: "shikimori_id_not_in_catalog",
            shikimori_id: shikimoriId,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=3600",
            },
          }
        );
        ctx.waitUntil(cache.put(cacheKey, fallbackResponse.clone()));
        return fallbackResponse;
      }

      // 6. Construct valid parent-backed AniBoom embed URL
      const parentPage = `https://animego.me/anime/${result.animego_slug}`;
      const embedUrl = `https://aniboom.one/embed/${result.aniboom_id}?episode=${episode}&translation=${translation}&parent=${encodeURIComponent(parentPage)}`;

      const responsePayload = {
        source: "aniboom",
        title: result.title_ru || "",
        aniboom_id: result.aniboom_id,
        animego_slug: result.animego_slug,
        episode: episode,
        embed_url: embedUrl,
      };

      const response = new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=86400", // Cache response at Cloudflare Edge
        },
      });

      // Put into Cloudflare Edge Cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;

    } catch (err) {
      console.error("[CF Worker Error]:", err);
      // Clean fallback response without 500 error
      return new Response(
        JSON.stringify({
          source: "kodik_fallback",
          reason: "worker_internal_fallback",
          error: err.message || "Internal error",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
