
export const onRequest = async (context: any) => {
  const { id } = context.params;
  
  if (!id || Array.isArray(id)) {
    return context.next();
  }

  const animeId = (id as string).split('-')[0];
  
  try {
    // Fetch anime data
    const res = await fetch(`https://shikimori.one/api/animes/${animeId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    
    if (!res.ok) {
      return context.next();
    }

    const anime = await res.json() as any;
    
    // BLOCK HENTAI PAGES - Redirect to home
    const adultGenreIds = [12, 539, 33, 34, 28, 26];
    if (anime.rating === 'rx' || anime.genres?.some((g: any) => adultGenreIds.includes(g.id))) {
      return new Response('Adult content blocked', { 
        status: 301,
        headers: { Location: '/' }
      });
    }

    // Fetch the original index.html (SPA fallback)
    // We fetch the root "/" to get index.html content
    const url = new URL(context.request.url);
    url.pathname = '/index.html';
    
    let originalResponse: Response;
    // @ts-ignore
    if (context.env.ASSETS) {
       // @ts-ignore
       originalResponse = await context.env.ASSETS.fetch(url);
    } else {
       originalResponse = await fetch(url);
    }
    
    let html = await originalResponse.text();

    const canonicalUrl = `https://kamianime.club/anime/${animeId}`;
    const title = `Смотреть ${anime.russian || anime.name} ${anime.name ? `/ ${anime.name} ` : ''}онлайн бесплатно в хорошем качестве`;
    const description = `Аниме ${anime.russian || anime.name} (${new Date(anime.aired_on).getFullYear() || ''}). ${anime.description ? anime.description.slice(0, 150).replace(/"/g, '"') : `Смотреть все серии онлайн бесплатно в хорошем качестве.`}... Смотреть все серии онлайн в озвучке Anilibria, Kodik и других.`;
    const image = anime.image?.original ? `https://shikimori.one${anime.image.original}` : '';
    const keywords = `${anime.russian || anime.name}, ${anime.name}, смотреть ${anime.russian || anime.name}, аниме онлайн, смотреть аниме бесплатно`;

    // Replace <title>
    html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    
    // Replace or Add Meta Description
    if (html.includes('<meta name="description"')) {
      html = html.replace(/<meta name="description" content=".*?"/, `<meta name="description" content="${description}"`);
    } else {
      html = html.replace('</head>', `<meta name="description" content="${description}">\n</head>`);
    }

    // Add Canonical Tag, OG Tags and Schema.org
    const schemaData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": anime.kind === 'tv' ? "TVSeries" : "Movie",
          "name": anime.russian || anime.name,
          "alternateName": anime.name,
          "description": anime.description,
          "image": image,
          "datePublished": anime.aired_on ? new Date(anime.aired_on).getFullYear() : undefined,
          "aggregateRating": anime.score ? {
            "@type": "AggregateRating",
            "ratingValue": anime.score,
            "bestRating": "10",
            "worstRating": "1",
            "ratingCount": "100"
          } : undefined
        }
      ]
    };

    const ogTags = `
      <link rel="canonical" href="${canonicalUrl}" />
      <meta property="og:title" content="${title}" />
      <meta property="og:description" content="${description}" />
      <meta property="og:image" content="${image}" />
      <meta property="og:url" content="${canonicalUrl}" />
      <meta property="og:type" content="video.movie" />
      <meta name="keywords" content="${keywords}" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title}" />
      <meta name="twitter:description" content="${description}" />
      <meta name="twitter:image" content="${image}" />
      <script type="application/ld+json">${JSON.stringify(schemaData)}</script>
    `;
    
    html = html.replace('</head>', `${ogTags}\n</head>`);

    // Inject content into body for bots (natively replaced when React hydrates)
    const botContent = `
      <article class="ssr-preview-content">
        <h1>${anime.russian || anime.name}</h1>
        <p>${anime.description || ''}</p>
        ${image ? `<img src="${image}" alt="${anime.russian || anime.name}" />` : ''}
      </article>
    `;
    // Try to inject into root div if it exists
    if (html.includes('<div id="root"></div>')) {
        html = html.replace('<div id="root"></div>', `<div id="root">${botContent}</div>`);
    } else if (html.includes('<div id="root">')) {
        // If root div is not empty or formatted differently
        html = html.replace('<div id="root">', `<div id="root">${botContent}`);
    }

    return new Response(html, {
      headers: { 
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });

  } catch (e) {
    console.error('Failed to fetch anime data', e);
    return context.next();
  }
};
