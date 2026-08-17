import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_URL = 'https://kamianime.club';
const SHIKIMORI_API = 'https://shikimori.one/api';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

let supabase: any = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  console.warn('Missing Supabase credentials, skipping database routes');
}

const staticRoutes = [
  '/',
  '/catalog',
  '/forum',
  '/news',
  '/social',
  '/calendar',
  '/premium',
  '/login',
  '/register',
  '/reset-password'
];

// Helper to delay execution (to avoid rate limits)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_RETRIES = 5;
const BASE_DELAY = 3000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchWithRetry(url: string, retries = 0): Promise<any> {
    try {
        const response = await fetch(url, {
            headers: { 
                'User-Agent': USER_AGENT,
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            return await response.json();
        }

        const status = response.status;
        
        if (retries >= MAX_RETRIES) {
            console.error(`\nFailed to fetch ${url} after ${MAX_RETRIES} retries. Status: ${status}`);
            return null;
        }

        if (status === 429 || status === 403 || status >= 500) {
            const delayTime = BASE_DELAY * Math.pow(2, retries);
            console.warn(`\nRequest failed (${status}), retrying in ${delayTime}ms...`);
            await delay(delayTime);
            return fetchWithRetry(url, retries + 1);
        }

        console.error(`\nRequest failed with status ${status}`);
        return null;
    } catch (error) {
        if (retries >= MAX_RETRIES) {
            console.error(`\nFailed to fetch ${url} after ${MAX_RETRIES} retries. Error:`, error);
            return null;
        }
        const delayTime = BASE_DELAY * Math.pow(2, retries);
        console.warn(`\nRequest failed (error), retrying in ${delayTime}ms...`);
        await delay(delayTime);
        return fetchWithRetry(url, retries + 1);
    }
}

const slugify = (text: string): string => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-');  // Replace multiple - with single -
};

async function fetchAnimeByYear(year: number) {
  let yearAnime: string[] = [];
  const isCloudflare = process.env.CF_PAGES === '1';
  if (!isCloudflare) {
    // Return a single mock/seed anime for ultra-fast local validation
    return [`/anime/1`];
  }
  const MAX_PAGES_PER_YEAR = 5; // Reduced to avoid timeout

  process.stdout.write(`Fetching year ${year}: `);

  for (let page = 1; page <= MAX_PAGES_PER_YEAR; page++) {
      const url = `${SHIKIMORI_API}/animes?limit=50&order=popularity&season=${year}&rating=!rx&genre=!12,!539,!33,!34,!28,!26&page=${page}`;
      const data = await fetchWithRetry(url);
      
      if (!data || !Array.isArray(data) || data.length === 0) {
          break; 
      }
      
      const urls = data.flatMap((anime: any) => {
          const base = `/anime/${anime.id}`;
          const slug = slugify(anime.name || anime.russian || '');
          return slug ? [base, `${base}-${slug}`] : [base];
      });
      yearAnime.push(...urls);
      process.stdout.write('.');
      await delay(500); // Slightly reduced delay but kept for safety
  }
  console.log(` (${yearAnime.length})`);
  return yearAnime;
}

async function fetchTopAnime() {
  const isCloudflare = process.env.CF_PAGES === '1';
  if (!isCloudflare) {
    console.log('Sandbox/Dev environment detected: Skipping heavy anime network scraping.');
    return ['/anime/1'];
  }
  console.log('Fetching anime by year (2010-2026)...');
  let allAnime: Set<string> = new Set();
  const currentYear = new Date().getFullYear();
  const startYear = 2010; // Reduced to avoid timeout
  
  let dmcaBlocks: string[] = [];
  if (supabase) {
    try {
      const { data } = await supabase.from('dmca_blocks').select('anime_id');
      if (data) {
        dmcaBlocks = data.map((d: any) => d.anime_id);
      }
    } catch (e) {
      console.error('Failed to fetch dmca_blocks', e);
    }
  }

  for (let year = currentYear; year >= startYear; year--) {
      const animeForYear = await fetchAnimeByYear(year);
      animeForYear.forEach(url => {
        // url is like /anime/12345
        const id = url.split('/').pop();
        if (id && dmcaBlocks.includes(id)) {
          allAnime.add(`/anime/${id}-watch`);
        } else {
          allAnime.add(url);
        }
      });
      await delay(1000); // Delay between years
  }
  
  const result = Array.from(allAnime);
  console.log(`\nTotal unique anime fetched: ${result.length}`);
  return result;
}

async function fetchForumTopics() {
  if (!supabase) return [];
  console.log('Fetching forum topics...');
  // Fetch more topics for better indexing
  const { data, error } = await supabase
    .from('forum_topics')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(500);
    
  if (error) {
      console.error('Failed to fetch forum topics:', error);
      return [];
  }
  return (data || []).map((t: any) => `/forum/${t.id}`);
}

async function fetchClubs() {
  if (!supabase) return [];
  console.log('Fetching clubs...');
  const { data, error } = await supabase
    .from('clubs')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(200);
    
  if (error) {
      console.error('Failed to fetch clubs:', error);
      return [];
  }
  return (data || []).map((c: any) => `/club/${c.id}`);
}

async function fetchNews() {
    console.log('Fetching news...');
    const data = await fetchWithRetry(`${SHIKIMORI_API}/topics?forum=news&limit=100&linked_type=Anime`);
    if (!data || !Array.isArray(data)) {
        return [];
    }
    return data.map((news: any) => `/news/${news.id}`);
}

async function fetchTopManga() {
    const isCloudflare = process.env.CF_PAGES === '1';
    if (!isCloudflare) {
        console.log('Sandbox/Dev environment detected: Skipping heavy manga network scraping.');
        return ['/?mangaId=1'];
    }
    console.log('Fetching manga by popularity...');
    let allManga: Set<string> = new Set();
    const MAX_PAGES = 100; // 5,000 in production
    
    process.stdout.write('Fetching popular manga: ');
    for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${SHIKIMORI_API}/mangas?limit=50&order=popularity&page=${page}`;
        const data = await fetchWithRetry(url);
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            break; 
        }
        
        data.forEach((m: any) => {
            allManga.add(`/?mangaId=${m.id}`);
        });
        process.stdout.write('.');
        await delay(150); // Keep delay concise
    }
    console.log(` (${allManga.size})`);
    return Array.from(allManga);
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
      switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
          default: return c;
      }
  });
}

function generateSitemapXML(urls: string[], priority = '0.8', freq = 'weekly', siteUrl = SITE_URL) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(route => `  <url>
    <loc>${escapeXml(siteUrl + route)}</loc>
    <changefreq>${route === '/' ? 'daily' : freq}</changefreq>
    <priority>${route === '/' ? '1.0' : priority}</priority>
  </url>`).join('\n')}
</urlset>`;
}

function generateSitemapIndex(sitemaps: string[]) {
    const date = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemaps.map(name => `  <sitemap>
    <loc>${SITE_URL}/${name}</loc>
    <lastmod>${date}</lastmod>
  </sitemap>`).join('\n')}
</sitemapindex>`;
}

async function generateSitemap() {
  const isCloudflare = process.env.CF_PAGES === '1';
  if (!isCloudflare) {
    console.log('Sandbox/Dev environment: Skipping full sitemap generation to compile instantly.');
    // Write minimal skeleton files so they exist and avoid bundler/router complaints
    const publicDir = path.resolve(process.cwd(), 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const emptySitemap = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
    fs.writeFileSync(path.join(publicDir, 'sitemap-main.xml'), emptySitemap);
    fs.writeFileSync(path.join(publicDir, 'sitemap-anime.xml'), emptySitemap);
    fs.writeFileSync(path.join(publicDir, 'sitemap-news.xml'), emptySitemap);
    fs.writeFileSync(path.join(publicDir, 'sitemap-manga.xml'), emptySitemap);
    fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>');
    return;
  }
  console.log('Starting sitemap generation...');
  
  const publicDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. Main Sitemap
  const mainXml = generateSitemapXML(staticRoutes, '1.0', 'daily');
  fs.writeFileSync(path.join(publicDir, 'sitemap-main.xml'), mainXml);
  console.log('Generated sitemap-main.xml');

  // 2. Anime Sitemap
  const animeRoutes = await fetchTopAnime();
  const animeXml = generateSitemapXML(animeRoutes, '0.8', 'weekly');
  fs.writeFileSync(path.join(publicDir, 'sitemap-anime.xml'), animeXml);
  console.log('Generated sitemap-anime.xml');

  // 3. News Sitemap
  const newsRoutes = await fetchNews();
  const newsXml = generateSitemapXML(newsRoutes, '0.7', 'daily');
  fs.writeFileSync(path.join(publicDir, 'sitemap-news.xml'), newsXml);
  console.log('Generated sitemap-news.xml');

  // 4. Forum Sitemap
  const forumRoutes = await fetchForumTopics();
  let forumSitemapName = '';
  if (forumRoutes.length > 0) {
      const forumXml = generateSitemapXML(forumRoutes, '0.6', 'daily');
      fs.writeFileSync(path.join(publicDir, 'sitemap-forum.xml'), forumXml);
      forumSitemapName = 'sitemap-forum.xml';
      console.log('Generated sitemap-forum.xml');
  }

  // 5. Clubs Sitemap
  const clubRoutes = await fetchClubs();
  let clubSitemapName = '';
  if (clubRoutes.length > 0) {
      const clubXml = generateSitemapXML(clubRoutes, '0.6', 'weekly');
      fs.writeFileSync(path.join(publicDir, 'sitemap-clubs.xml'), clubXml);
      clubSitemapName = 'sitemap-clubs.xml';
      console.log('Generated sitemap-clubs.xml');
  }

  // 6. Manga Sitemap (written statically for independent submission)
  try {
    const mangaRoutes = await fetchTopManga();
    if (mangaRoutes.length > 0) {
        const mangaXml = generateSitemapXML(mangaRoutes, '0.8', 'weekly', 'https://manga.kamianime.club');
        fs.writeFileSync(path.join(publicDir, 'sitemap-manga.xml'), mangaXml);
        console.log('Generated sitemap-manga.xml');
    }
  } catch (mangaErr) {
    console.error('Failed to generate sitemap-manga.xml', mangaErr);
  }

  // 7. Index Sitemap
  const sitemaps = [
      'sitemap-main.xml',
      'sitemap-anime.xml',
      'sitemap-news.xml',
      forumSitemapName,
      clubSitemapName
  ].filter(Boolean);

  const indexXml = generateSitemapIndex(sitemaps);
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), indexXml);
  console.log(`Sitemap Index generated successfully at public/sitemap.xml linking to ${sitemaps.length} files.`);
}

generateSitemap().catch(console.error);
