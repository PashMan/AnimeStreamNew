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
      // 4. Query Cloudflare D1 database (supports bindings DB, animego_catalog, DB_PROD)
      const db = env.DB || env.animego_catalog || env.DB_PROD;
      if (!db) {
        throw new Error("D1 database binding is not configured in Worker environment");
      }

      // Query D1 table for aniboom mapping
      const query = "SELECT aniboom_id, animego_slug, title_ru FROM animego_catalog WHERE shikimori_id = ? LIMIT 1";
      const result = await db.prepare(query).bind(shikimoriId).first();

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
