export const onRequest: PagesFunction = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);
  
  // params.path is an array of path segments after /anime/
  const pathParts = params.path as string[] || [];
  const animeId = pathParts[0];
  
  if (!animeId) {
    return env.ASSETS.fetch(request);
  }

  // Only intercept HTML requests
  if (!request.headers.get('accept')?.includes('text/html')) {
    return env.ASSETS.fetch(request);
  }

  try {
    // Fetch anime details from Shikimori
    const shikimoriRes = await fetch(`https://shikimori.one/api/animes/${animeId}`, {
      headers: {
        'User-Agent': 'KamiAnime/1.0',
      }
    });

    if (!shikimoriRes.ok) {
      return env.ASSETS.fetch(request);
    }

    const anime = await shikimoriRes.json() as any;

    // BLOCK HENTAI PAGES - Redirect to home
    const adultGenreIds = [12, 539, 33, 34, 28, 26];
    if (anime.rating === 'rx' || anime.genres?.some((g: any) => adultGenreIds.includes(g.id))) {
      return new Response('Adult content blocked', { 
        status: 301,
        headers: { Location: '/' }
      });
    }

    const title = anime.russian || anime.name;
    const originalTitle = anime.name;
    const image = anime.image?.original ? `https://shikimori.one${anime.image.original}` : '';
    const score = anime.score;
    const episodes = anime.episodes_aired || anime.episodes || 0;
    const status = anime.status;

    // Fetch SEO description from D1
    let seoDescription = anime.description || `Смотреть аниме ${title} онлайн бесплатно в хорошем качестве.`;
    try {
      const db = (env as any).DB;
      if (db) {
        const { results } = await db.prepare("SELECT seo_description FROM anime_seo WHERE anime_id = ?").bind(animeId).all();
        if (results && results.length > 0 && results[0].seo_description) {
          seoDescription = results[0].seo_description;
        }
      }
    } catch (e) {
      console.error('Failed to fetch SEO from D1', e);
    }

    // Determine if we are on an episode page
    let episodeNum = '';
    if (pathParts.length >= 3 && pathParts[1] === 'episode') {
      episodeNum = pathParts[2];
    }

    let pageTitle = `${title} смотреть онлайн бесплатно`;
    let pageDescription = seoDescription;

    if (episodeNum) {
      pageTitle = `Смотреть ${title} ${episodeNum} серия онлайн бесплатно в хорошем качестве`;
      pageDescription = `Вышла новая ${episodeNum} серия аниме ${title}! Смотрите онлайн в хорошем качестве. ${seoDescription}`;
    } else if (status === 'ongoing' && episodes > 0) {
      pageTitle = `Смотреть ${title} ${episodes} серия онлайн бесплатно`;
      pageDescription = `Смотрите новую ${episodes} серию аниме ${title} онлайн бесплатно. ${seoDescription}`;
    }

    // Fetch the original HTML
    const response = await env.ASSETS.fetch(request);
    
    // Rewrite HTML
    class SEOHandler {
      element(element: any) {
        if (element.tagName === 'title') {
          element.setInnerContent(pageTitle);
        } else if (element.tagName === 'meta') {
          const name = element.getAttribute('name');
          
          if (name === 'description') {
            element.setAttribute('content', pageDescription);
          }
        }
      }
    }

    class HeadHandler {
      element(element: any) {
        // Inject OG and Twitter tags
        element.append(`<meta property="og:title" content="${pageTitle}">`, { html: true });
        element.append(`<meta property="og:description" content="${pageDescription}">`, { html: true });
        if (image) {
          element.append(`<meta property="og:image" content="${image}">`, { html: true });
          element.append(`<meta name="twitter:image" content="${image}">`, { html: true });
        }
        element.append(`<meta name="twitter:title" content="${pageTitle}">`, { html: true });
        element.append(`<meta name="twitter:description" content="${pageDescription}">`, { html: true });
        element.append(`<meta name="twitter:card" content="summary_large_image">`, { html: true });

        // Inject Schema.org JSON-LD
        const schema = {
          "@context": "https://schema.org",
          "@type": episodeNum ? "TVEpisode" : "TVSeries",
          "name": episodeNum ? `${title} - Серия ${episodeNum}` : title,
          "alternateName": originalTitle,
          "image": image,
          "description": pageDescription,
          "aggregateRating": score ? {
            "@type": "AggregateRating",
            "ratingValue": score,
            "bestRating": "10",
            "ratingCount": "100" // Mock count as Shikimori API doesn't always provide it easily here
          } : undefined,
          "partOfSeries": episodeNum ? {
            "@type": "TVSeries",
            "name": title
          } : undefined,
          "episodeNumber": episodeNum || undefined
        };

        element.append(`<script type="application/ld+json">${JSON.stringify(schema)}</script>`, { html: true });
      }
    }

    return new HTMLRewriter()
      .on('title', new SEOHandler())
      .on('meta', new SEOHandler())
      .on('head', new HeadHandler())
      .transform(response);

  } catch (e) {
    console.error('Edge SEO Error:', e);
    return env.ASSETS.fetch(request);
  }
};
