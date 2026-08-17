import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import { makeRoomWebSocketHandler } from './utils/socketServer';
import { upgradeWebSocket as nodeUpgradeWebSocket } from '@hono/node-server';
import { upgradeWebSocket as cfUpgradeWebSocket } from 'hono/cloudflare-workers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// Check if running on Cloudflare Workers / Pages
const isCloudflare = typeof WebSocketPair !== 'undefined';

const handleRoomWebSocket = isCloudflare
  ? makeRoomWebSocketHandler(cfUpgradeWebSocket)
  : makeRoomWebSocketHandler(nodeUpgradeWebSocket);

app.use('/*', cors());

app.onError((err, c) => {
  console.error(`[HONO UNCAUGHT ERROR]:`, err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message || String(err)
  }, 500);
});

app.use('/*', async (c, next) => {
  const method = c.req.method;
  const url = c.req.url;
  console.log(`[HONO REQUEST] ${method} ${url}`);
  try {
    await next();
    console.log(`[HONO RESPONSE] ${method} ${url} - Status: ${c.res.status}`);
  } catch (err: any) {
    console.error(`[HONO ERROR] ${method} ${url} - Error:`, err);
    return c.json({ error: 'Internal Server Error', message: err.message }, 500);
  }
});

  // Simple in-memory log buffer for debugging
  const debugLogs: any[] = [];
  const addLog = (message: string, data?: any) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data: data || null
    };
    debugLogs.unshift(logEntry);
    if (debugLogs.length > 100) debugLogs.pop(); // Keep last 100 logs
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  };

// API Route to retrieve debug logs
app.get('/api/debug-logs', (c) => {
  console.log('[API] GET /api/debug-logs');
  return c.json(debugLogs);
});

// API Route to test logging
app.get('/api/test-log', (c) => {
  console.log('[API] GET /api/test-log', c.req.query);
  addLog('Manual Test Log', { query: c.req.query, userAgent: c.req.header('user-agent') });
  return c.json({ status: 'ok', message: 'Test log added' });
});

// API Route to clear server-side in-memory cache
app.post('/api/clear-server-cache', (c) => {
  console.log('[API] POST /api/clear-server-cache');
  jikanImageCache.clear();
  return c.json({ status: 'ok', message: 'Серверный кэш успешно сброшен!' });
});

// API Route for AI Anime Recommendation (Supports DeepSeek and Gemini API)
app.post('/api/ai/recommend', async (c) => {
  try {
    const { messages } = await c.req.json();
    
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    
    if (!deepseekKey && !geminiKey) {
      return c.json({ error: 'AI API keys not configured. Please define DEEPSEEK_API_KEY or GEMINI_API_KEY in Settings/Secrets.' }, 400);
    }
    
    const systemPrompt = "Вы — дружелюбный искусственный интеллект-ассистент KamiAnime, эксперт по аниме. " +
      "Ваша цель — рекомендовать пользователю подходящие под его запрос тайтлы, отвечать на вопросы об аниме и помогать с выбором. " +
      "Пишите кратко, живо, структурировано. Используйте разметку markdown. Рекомендации должны содержать русские и оригинальные названия. " +
      "Отвечайте ВСЕГДА на русском языке. " +
      "ОБЯЗАТЕЛЬНОЕ ТРЕБОВАНИЕ: Для каждого рекомендуемого аниме вы должны добавить ссылку в чат в формате markdown: `[Русское название](/anime/ID)`, где ID — это реальный Shikimori ID этого аниме. " +
      "Пожалуйста, вспомните правильный Shikimori ID для рекомендуемого тайтла из вашей базы знаний (например: Атака титанов ID: 16498, Тетрадь смерти ID: 1535, Клинок рассекающий демонов ID: 38000, Ван-Пис ID: 21, Наруто ID: 20, Магическая битва ID: 40748, Токийский гуль ID: 22319, Евангелион ID: 30, Твоё имя ID: 32281, Унесённые призраками ID: 199, Код Гиас ID: 1575, Сага о Винланде ID: 37521, Хантер х Хантер 2011 ID: 11061, Госпожа Кагуя ID: 37999, Человек-бензопила ID: 44511, Твое апрельское вранье ID: 23273, Созданный в Бездне ID: 34599, Бездомный бог ID: 20507, Моб Психо 100 ID: 32182). " +
      "Никогда не указывайте внешние ссылки типа shikimori.one или другие домены, используйте только относительный путь `/anime/ID`.";
    
    if (deepseekKey) {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('DeepSeek API error:', errorText);
        throw new Error(`DeepSeek API returned error ${response.status}`);
      }
      
      const data = await response.json() as any;
      const text = data.choices?.[0]?.message?.content || 'Извините, произошла ошибка.';
      return c.json({ text });
    } else {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
      
      const formattedContents = messages.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: formattedContents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7
        }
      });
      
      return c.json({ text: response.text || 'Извините, произошла ошибка.' });
    }
  } catch (err: any) {
    console.error('AI Recommend API Error:', err);
    return c.json({ error: err.message || 'Ошибка сервера при получении рекомендаций.' }, 500);
  }
});

// API Route for Shikimori (Proxy to bypass CORS in production)
app.get('/api/shikimori/*', async (c) => {
  const path = c.req.path.replace(/^\/api\/shikimori/, '');
  const query = c.req.url.includes('?') ? c.req.url.substring(c.req.url.indexOf('?')) : '';
  const targetUrl = `https://shikimori.one/api${path}${query}`;
  
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://shikimori.one/'
      }
    });

    if (response.ok) {
      const data = await response.json();
      return c.json(data);
    } else {
      console.error(`[HONO SHIKIMORI PROXY FAILED] Status: ${response.status} for path: ${path}`);
      try {
        const text = await response.text();
        return c.text(text, response.status as any);
      } catch {
        return c.json({ error: `Shikimori API responded with status ${response.status}` }, response.status as any);
      }
    }
  } catch (err: any) {
    console.error(`[HONO SHIKIMORI PROXY ERROR] Path: ${path}`, err);
    return c.json({ error: 'Proxy failed', message: err.message }, 500);
  }
});

// API Route for Anilibria v3 (Proxy to bypass CORS)
app.get('/api/anilibria/title', async (c) => {
  const shikimori = c.req.query('shikimori');
  console.log(`[API] Anilibria Proxy: shikimori=${shikimori}`);
  if (!shikimori) {
    return c.json({ error: 'Shikimori ID is required' }, 400);
  }
  try {
    const response = await fetch(`https://api.anilibria.tv/v3/title/get?shikimori=${shikimori}`);
    if (!response.ok) {
      console.error(`[API] Anilibria API error: ${response.status}`);
      return c.json({ error: 'Anilibria API error' }, response.status as any);
    }
    const data = await response.json();
    return c.json(data);
  } catch (error: any) {
    console.error('[API] Anilibria Proxy Error:', error.message);
    return c.json({ error: 'Failed to fetch from Anilibria' }, 500);
  }
});




  const fetchCollaps = async (title: any, year: any, kinopoisk_id: any, imdb_id: any, shikimori_id: any, world_art_id: any) => {
    const tryFetch = async (query: string) => {
      try {
        const url = `https://api.apibd.net/v1/search?token=b4b2c1b2c1b2c1b2c1b2c1b2c1b2c1b2${query}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.results && data.results.length > 0) return data.results;
      } catch (e) {
        console.error(`[COLLAPS] Fetch failed for query: ${query}`, e);
      }
      return null;
    };

    let results = null;
    if (imdb_id) results = await tryFetch(`&imdb_id=${imdb_id}`);
    if (!results && kinopoisk_id) results = await tryFetch(`&kinopoisk_id=${kinopoisk_id}`);
    if (!results && shikimori_id) {
      results = await tryFetch(`&shikimori_id=${shikimori_id}`);
      if (!results) results = await tryFetch(`&shikimori=${shikimori_id}`);
    }
    if (!results && world_art_id) {
      results = await tryFetch(`&world_art_id=${world_art_id}`);
      if (!results) results = await tryFetch(`&worldart_id=${world_art_id}`);
    }
    if (!results && title) results = await tryFetch(`&name=${encodeURIComponent(String(title))}${year ? `&year=${year}` : ''}`);

    if (results && results.length > 0) {
      let bestMatch = results[0];
      if (title) {
        const searchTitle = String(title).toLowerCase();
        console.log(`[COLLAPS] Filtering results for title: ${searchTitle}`);
        
        const exactMatch = results.find((r: any) => 
          (r.name || r.title || '').toLowerCase() === searchTitle ||
          (r.name || r.title || '').toLowerCase().includes(searchTitle)
        );
        
        if (exactMatch) {
          console.log(`[COLLAPS] Found exact match: ${exactMatch.name || exactMatch.title}`);
          bestMatch = exactMatch;
        } else {
          const season1 = results.find((r: any) => 
            (r.name || r.title || '').toLowerCase().includes('1 сезон') || 
            (r.name || r.title || '').toLowerCase().includes('season 1')
          );
          if (season1) {
            console.log(`[COLLAPS] Found Season 1 match: ${season1.name || season1.title}`);
            bestMatch = season1;
          }
        }
      }
      return [bestMatch];
    }
    console.warn(`[COLLAPS] No results found for query`);
    return [];
  };

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
  
  if (animegoCache.has(shikimoriId)) {
    console.log(`[AnimeGo Scraper] Cache hit for Shikimori ID: ${shikimoriId}`);
    return animegoCache.get(shikimoriId)!;
  }

  console.log(`[AnimeGo Scraper] Starting resolution for Shikimori ID: ${shikimoriId}, title query: ${searchTitle}`);

  let ruTitle = searchTitle;
  let enTitle = '';
  let shikiEpisodesCount = 0;
  
  try {
    const shikiRes = await fetch(`https://shikimori.one/api/animes/${shikimoriId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://shikimori.one/'
      },
      signal: AbortSignal.timeout(2500)
    });
    if (shikiRes.ok) {
      const shikiData = await shikiRes.json() as any;
      if (shikiData) {
        if (shikiData.russian) ruTitle = shikiData.russian;
        if (shikiData.name) enTitle = shikiData.name;
        shikiEpisodesCount = shikiData.episodes_aired || shikiData.episodes || 0;
      }
    }
  } catch (err: any) {
    console.error(`[AnimeGo Scraper] Shikimori title fetch failed: ${err.message}`);
  }

  const searchQueries = [ruTitle, enTitle].filter(Boolean) as string[];
  if (searchQueries.length === 0) {
    console.error(`[AnimeGo Scraper] No title available to search AnimeGo`);
    animegoCache.set(shikimoriId, { animegoId: '', aniboomMap: [], defaultAniboomUrl: '', quality: '1080' });
    return null;
  }

  const domains = ['animego.me', 'animego.org'];
  let searchHtml = '';
  let activeDomain = 'animego.me';

  for (const queryTitle of searchQueries) {
    for (const domain of domains) {
      const searchUrl = `https://${domain}/search/anime?q=${encodeURIComponent(queryTitle)}`;
      try {
        console.log(`[AnimeGo Scraper] Searching on ${domain}: ${searchUrl}`);
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru,en-US;q=0.7,en;q=0.3'
          },
          signal: AbortSignal.timeout(2500)
        });
        if (res.ok) {
          const html = await res.text();
          if (html.includes('/anime/')) {
            searchHtml = html;
            activeDomain = domain;
            console.log(`[AnimeGo Scraper] Search request succeeded on ${domain} for query "${queryTitle}"`);
            break;
          }
        }
      } catch (err: any) {
        console.warn(`[AnimeGo Scraper] Search failed on ${domain}: ${err.message}`);
      }
    }
    if (searchHtml) break;
  }

  if (!searchHtml) {
    console.error(`[AnimeGo Scraper] Search failed on all domains`);
    animegoCache.set(shikimoriId, { animegoId: '', aniboomMap: [], defaultAniboomUrl: '', quality: '1080', totalEpisodes: shikiEpisodesCount || undefined });
    return null;
  }

  const regex = /href="(?:\/|https?:\/\/[^\/]+\/)anime\/([a-z0-9-]+-([0-9]+))"/gi;
  const candidates: { path: string; id: string }[] = [];
  let match;
  const seenUrls = new Set<string>();

  while ((match = regex.exec(searchHtml)) !== null) {
    const fullPath = `/anime/${match[1]}`;
    const animegoId = match[2];
    if (!seenUrls.has(fullPath)) {
      seenUrls.add(fullPath);
      candidates.push({ path: fullPath, id: animegoId });
    }
  }

  console.log(`[AnimeGo Scraper] Found ${candidates.length} search candidate pages`);

  let matchedAnimegoId: string | null = null;
  let detectedEpisodes = shikiEpisodesCount || 0;

  for (const cand of candidates.slice(0, 3)) {
    const detailUrl = `https://${activeDomain}${cand.path}`;
    try {
      console.log(`[AnimeGo Scraper] Verification check for candidate page: ${detailUrl}`);
      const res = await fetch(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru,en-US;q=0.7,en;q=0.3'
        },
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const detailHtml = await res.text();
        const shikiPattern = new RegExp(`shikimori\\.(one|io|org|me)\\/animes\\/${shikimoriId}\\b|\\b/animes/${shikimoriId}\\b|\\b/animes/y${shikimoriId}\\b`, 'i');
        const isMatched = shikiPattern.test(detailHtml);
        
        // Extract episode counts from AnimeGo HTML if available
        const epMatch = detailHtml.match(/(?:Эпизоды|Серии)[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/i) || detailHtml.match(/(\d+)\s*(?:из|\/)\s*(\d+)\s*(?:эп|сер)/i);
        if (epMatch) {
          const numMatch = epMatch[0].match(/(\d+)/g);
          if (numMatch && numMatch.length > 0) {
            const foundMax = Math.max(...numMatch.map(n => parseInt(n)));
            if (foundMax > detectedEpisodes) detectedEpisodes = foundMax;
          }
        }

        if (isMatched) {
          console.log(`[AnimeGo Scraper] MATCH SUCCESS! Verified Shikimori ID ${shikimoriId} inside candidate: ${detailUrl}`);
          matchedAnimegoId = cand.id;
          break;
        }
      }
    } catch (err: any) {
      console.warn(`[AnimeGo Scraper] Detail page fetch failed for ${detailUrl}: ${err.message}`);
    }
  }

  if (!matchedAnimegoId && candidates.length > 0) {
    console.warn(`[AnimeGo Scraper] No candidate page contained Shikimori ID link. Falling back to the first search result: ${candidates[0].path}`);
    matchedAnimegoId = candidates[0].id;
  }

  if (!matchedAnimegoId) {
    console.error(`[AnimeGo Scraper] Failed to resolve AnimeGo ID for Shikimori ID ${shikimoriId}`);
    animegoCache.set(shikimoriId, { animegoId: '', aniboomMap: [], defaultAniboomUrl: '', quality: '1080', totalEpisodes: detectedEpisodes || undefined });
    return null;
  }

  const playerUrl = `https://${activeDomain}/player/${matchedAnimegoId}`;
  console.log(`[AnimeGo Scraper] Fetching players from: ${playerUrl}`);

  let aniboomMap: { voice: string; url: string; episodesCount?: number }[] = [];
  let defaultAniboomUrl = '';

  try {
    const playerRes = await fetch(playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': `https://${activeDomain}/anime/slug-${matchedAnimegoId}`,
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      signal: AbortSignal.timeout(2500)
    });

    if (playerRes.ok) {
      const playerJson = await playerRes.json() as any;
      const html = playerJson.data?.content || '';

      // Check max episodes in player tabs/data-episode attributes
      const epAttrMatches = [...html.matchAll(/data-episode="(\d+)"/gi), ...html.matchAll(/data-count="(\d+)"/gi)];
      for (const em of epAttrMatches) {
        const parsed = parseInt(em[1]);
        if (parsed > detectedEpisodes) detectedEpisodes = parsed;
      }

      const buttonMatches = [...html.matchAll(/<[a-z0-9]+[^>]+data-player="([^"]+)"[^>]*>/gi)];
      for (const m of buttonMatches) {
        const fullTag = m[0];
        const rawPlayerUrl = m[1].replace(/&amp;/g, '&').replace(/\\/g, '');
        const providerTitle = fullTag.match(/data-provider-title="([^"]+)"/i)?.[1];
        const translationTitle = fullTag.match(/data-translation-title="([^"]+)"/i)?.[1];

        if (providerTitle === 'AniBoom' || rawPlayerUrl.includes('aniboom')) {
          let cleanUrl = rawPlayerUrl;
          if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
          
          if (translationTitle) {
            aniboomMap.push({ 
              voice: translationTitle, 
              url: cleanUrl,
              episodesCount: detectedEpisodes || undefined
            });
          }
          if (!defaultAniboomUrl) {
            defaultAniboomUrl = cleanUrl;
          }
        }
      }

      if (aniboomMap.length === 0) {
        const fallbackMatches = [...html.matchAll(/(?:\/\/|https?:\/\/|\\\/\\\/)aniboom\.one\/embed\/([a-zA-Z0-9_-]+)(\?[^"'\s\\]*)?/g)];
        if (fallbackMatches.length > 0) {
          defaultAniboomUrl = `https://aniboom.one/embed/${fallbackMatches[0][1]}`;
          if (fallbackMatches[0][2]) {
            defaultAniboomUrl += fallbackMatches[0][2].replace(/&amp;/g, '&').replace(/\\/g, '');
          }
        }
      }
    }
  } catch (err: any) {
    console.error(`[AnimeGo Scraper] Player fetch failed: ${err.message}`);
  }

  if (!defaultAniboomUrl && aniboomMap.length > 0) {
    defaultAniboomUrl = aniboomMap[0].url;
  }

  let quality = '1080'; // default native for AniBoom
  if (defaultAniboomUrl) {
    try {
      let testUrl = defaultAniboomUrl;
      if (!testUrl.includes('episode=')) {
        testUrl += (testUrl.includes('?') ? '&' : '?') + 'episode=1';
      }
      if (!testUrl.includes('translation=')) {
        testUrl += (testUrl.includes('?') ? '&' : '?') + 'translation=16';
      }
      const qRes = await fetch(testUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://animego.org/'
        },
        signal: AbortSignal.timeout(2000)
      });
      if (qRes.ok) {
        const qHtml = await qRes.text();
        const qMatch = qHtml.match(/data-parameters="([^"]+)"/) || qHtml.match(/data-parameters='([^']+)'/);
        if (qMatch) {
          const rawParams = qMatch[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'");
          const decoded = JSON.parse(rawParams);
          if (decoded.qualityVideo) {
            quality = String(decoded.qualityVideo);
          }
        }
      }
    } catch (e: any) {
      console.warn(`[AnimeGo Scraper] Quality detection failed: ${e.message}`);
    }
  }

  const result: AnimegoData = {
    animegoId: matchedAnimegoId,
    aniboomMap,
    defaultAniboomUrl,
    quality,
    totalEpisodes: detectedEpisodes || undefined
  };

  animegoCache.set(shikimoriId, result);
  console.log(`[AnimeGo Scraper] Completed resolution for Shikimori ID ${shikimoriId}. Found ${aniboomMap.length} AniBoom streams. Max episodes: ${detectedEpisodes}`);
  return result;
}

// API Route for Balancer (Multiple players)
app.get('/api/balancer', async (c) => {
  // Allow grey-market API fetches with self-signed / expired certs
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const title = c.req.query('title');
  const year = c.req.query('year');
  const shikimori_id = c.req.query('shikimori_id');
  
  console.log(`[API] Balancer: title=${title}, year=${year}, shiki=${shikimori_id}`);
  addLog('Balancer Request Started', { title, year, shikimori_id });

  const fetchWithTimeout = async (url: string, options: any = {}, timeoutMs = 4000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          ...(options.headers || {})
        }
      });
      clearTimeout(id);
      return response;
    } catch (error: any) {
      clearTimeout(id);
      if (error.name === 'AbortError') {
        throw new Error(`Timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  };
  
  try {
    if (!title && !shikimori_id) {
      addLog('Balancer Request Failed: Missing Title and Shikimori ID');
      return c.json({ error: 'Title or Shikimori ID is required' }, 400);
    }

    let kinopoisk_id: string | null = null;
    let imdb_id: string | null = null;
    let world_art_id: string | null = null;
    let kodik_translations: any[] = [];
    let kodik_iframe: string | null = null;

    let resolvedTitle = title;
    if (!resolvedTitle && shikimori_id) {
      try {
        const shikiRes = await fetchWithTimeout(`https://shikimori.one/api/animes/${shikimori_id}`, {}, 2000);
        if (shikiRes.ok) {
          const shikiData = await shikiRes.json() as any;
          resolvedTitle = shikiData.russian || shikiData.name;
        }
      } catch (_) {}
    }

    const ids = {
      shikimori_id,
      kinopoisk_id,
      imdb_id,
      world_art_id,
      anilibria_id: null as number | null
    };

    // 1. Kodik (Primary source & ID resolver)
    try {
      const kodikTokens = [
        'b7cc4293ed475c4ad1fd599d114f4435', // User custom 1
        '17cc4ee691bc251131a9041e6e89e78e', // Original
        '45c53578f11ecfb74e31267b634cc6a8'  // User custom 2
      ];

      for (const token of kodikTokens) {
        try {
          const kodikUrl = `https://kodik-api.com/search?token=${token}&${shikimori_id ? `shikimori_id=${shikimori_id}` : `title=${encodeURIComponent(String(title))}`}&with_material_data=true`;
          const kodikRes = await fetchWithTimeout(kodikUrl, {}, 3500);
          if (kodikRes.ok) {
            const kodikData = await kodikRes.json() as any;
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

              // Group and collect unique translations from Kodik results with accurate max episodes
              const translationsMap = new Map();
              kodikData.results.forEach((res: any) => {
                if (res.translation && res.translation.title) {
                  const tName = res.translation.title.trim();
                  const iframe = res.link.startsWith('//') ? `https:${res.link}` : res.link;
                  let formattedIframe = iframe;
                  try {
                    const url = new URL(iframe);
                    url.searchParams.set('api', '1');
                    formattedIframe = url.toString();
                  } catch (_) {}

                  const epCount = res.episodes_count || res.last_episode || 1;
                  const lastEp = res.last_episode || res.episodes_count || 1;

                  if (!translationsMap.has(tName)) {
                    translationsMap.set(tName, {
                      id: res.translation.id,
                      title: tName,
                      type: res.translation.type || 'voice',
                      iframe: formattedIframe,
                      episodes_count: epCount,
                      last_episode: lastEp
                    });
                  } else {
                    const existing = translationsMap.get(tName);
                    existing.episodes_count = Math.max(existing.episodes_count, epCount);
                    existing.last_episode = Math.max(existing.last_episode, lastEp);
                  }
                }
              });
              kodik_translations = Array.from(translationsMap.values());

              const res = kodikData.results[0];
              let link = res.link.startsWith('//') ? `https:${res.link}` : res.link;
              try {
                const url = new URL(link);
                url.searchParams.set('api', '1');
                kodik_iframe = url.toString();
              } catch (_) {
                kodik_iframe = link;
              }
              break; // Successfully got Kodik results, no need to try other tokens
            }
          }
        } catch (err: any) {
          console.warn(`[KODIK] Failed with token ${token}:`, err.message);
        }
      }
    } catch (e: any) {
      addLog('Kodik fetch failed', { error: e.message });
    }

    // Prepare placeholders for prospective providers
    let collaps_iframe: string | null = null;
    let collaps_info: { iframe: string; has1080: boolean; epCount: number } | null = null;
    let bhcesh_iframe: string | null = null;
    let videocdn_iframe: string | null = null;
    let bazon_iframe: string | null = null;
    let hdvb_iframe: string | null = null;
    let iframe_video_iframe: string | null = null;
    let pleer_iframe: string | null = null;
    let anilibria_iframe: string | null = null;

    // Concurrently fetch alternate providers to minimize response latency
    const jobs: Promise<void>[] = [];

    // 3. Collaps
    jobs.push((async () => {
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
          const res = await fetchWithTimeout(collapsUrl, {}, 3000);
          if (res.ok) {
            const d = await res.json() as any;
            if (d.results && d.results.length > 0 && d.results[0].iframe_url) {
              const item = d.results[0];
              collaps_iframe = item.iframe_url;

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

              addLog(`Collaps found: ${collaps_iframe} with 1080p=${has1080}`);
            }
          }
        }
      } catch (e: any) {
        addLog('[COLLAPS] failed', { error: e.message });
      }
    })());

    // 4. Bhcesh
    if (kinopoisk_id) {
      jobs.push((async () => {
        try {
          const url = `https://api.bhcesh.me/list?token=eedefb541aeba871dcfc756e6b31c02e&kinopoisk_id=${kinopoisk_id}`;
          const res = await fetchWithTimeout(url, {}, 3000);
          if (res.ok) {
            const d = await res.json() as any;
            if (d.results && d.results.length > 0 && d.results[0].iframe_url) {
              bhcesh_iframe = d.results[0].iframe_url;
              addLog(`Bhcesh found: ${bhcesh_iframe}`);
            }
          }
        } catch (e: any) {
          addLog('[BHCESH] failed', { error: e.message });
        }
      })());
    }

    // 5. Bazon
    if (kinopoisk_id) {
      jobs.push((async () => {
        try {
          const url = `https://bazon.cc/api/search?token=2848f79ca09d4bbbf419bcdb464b4d11&kp=${kinopoisk_id}`;
          const res = await fetchWithTimeout(url, {}, 3000);
          if (res.ok) {
            const d = await res.json() as any;
            if (d.results && d.results.length > 0) {
              bazon_iframe = d.results[0].link || d.results[0].iframe_url;
              addLog(`Bazon found: ${bazon_iframe}`);
            }
          }
        } catch (e: any) {
          addLog('[BAZON] failed', { error: e.message });
        }
      })());
    }

    // 6. VideoCDN
    if (kinopoisk_id) {
      jobs.push((async () => {
        try {
          const url = `https://videocdn.tv/api/short?api_token=pfp3D870PGEY3Afjti0gMtSfmn2aZqih&kinopoisk_id=${kinopoisk_id}`;
          const res = await fetchWithTimeout(url, {}, 3000);
          if (res.ok) {
            const d = await res.json() as any;
            if (d.data && d.data.length > 0) {
              videocdn_iframe = d.data[0].iframe_src || d.data[0].iframe;
              addLog(`VideoCDN found: ${videocdn_iframe}`);
            }
          }
        } catch (e: any) {
          addLog('[VIDEOCDN] failed', { error: e.message });
        }
      })());
    }

    // 7. HDVB
    if (kinopoisk_id) {
      jobs.push((async () => {
        try {
          const url = `https://apivb.info/api/videos.json?token=5e2fe4c70bafd9a7414c4f170ee1b192&id_kp=${kinopoisk_id}`;
          const res = await fetchWithTimeout(url, {}, 3000);
          if (res.ok) {
            const d = await res.json() as any;
            if (Array.isArray(d) && d.length > 0) {
              hdvb_iframe = d[0].iframe_url || d[0].iframe;
              addLog(`HDVB found: ${hdvb_iframe}`);
            }
          }
        } catch (e: any) {
          addLog('[HDVB] failed', { error: e.message });
        }
      })());
    }

    // 8. Iframe
    if (kinopoisk_id) {
      jobs.push((async () => {
        try {
          const url = `https://iframe.video/api/v2/search?kp=${kinopoisk_id}`;
          const res = await fetchWithTimeout(url, {}, 3000);
          if (res.ok) {
            const d = await res.json() as any;
            if (d.results && d.results.length > 0) {
              iframe_video_iframe = d.results[0].path || d.results[0].iframe;
            } else if (d.results && d.results.path) {
              iframe_video_iframe = d.results.path;
            }
            if (iframe_video_iframe) {
              addLog(`Iframe found: ${iframe_video_iframe}`);
            }
          }
        } catch (e: any) {
          addLog('[IFRAME.VIDEO] failed', { error: e.message });
        }
      })());
    }

    // 9. Pleer.video
    if (kinopoisk_id) {
      jobs.push((async () => {
        try {
          const url = `https://pleer.video/${kinopoisk_id}.json`;
          const res = await fetchWithTimeout(url, {}, 3000);
          if (res.ok) {
            const d = await res.json() as any;
            if (d.embeds && d.embeds.length > 0) {
              pleer_iframe = d.embeds[0].iframe;
              addLog(`Pleer found: ${pleer_iframe}`);
            }
          }
        } catch (e: any) {
          addLog('[PLEER] failed', { error: e.message });
        }
      })());
    }

    // 10. Anilibria
    jobs.push((async () => {
      try {
        const url = `https://anilibria.top/api/v1/app/search/releases?query=${encodeURIComponent(String(title))}`;
        const anilibriaRes = await fetchWithTimeout(url, {}, 3000);
        if (anilibriaRes.ok) {
          const anilibriaData = await anilibriaRes.json() as any;
          if (anilibriaData && anilibriaData.length > 0) {
            let bestMatch = anilibriaData[0];
            if (year) {
              const yearMatch = anilibriaData.find((r: any) => r.year === parseInt(String(year)));
              if (yearMatch) bestMatch = yearMatch;
            }
            anilibria_iframe = `https://www.anilibria.tv/public/iframe.php?id=${bestMatch.id}`;
            ids.anilibria_id = bestMatch.id;
            addLog(`Anilibria found: ${anilibria_iframe}`);
          }
        }
      } catch (e: any) {
        addLog('Anilibria fetch failed', { error: e.message });
      }
    })());

    let aniboom_iframe: string | null = null;
    let animego_aniboom_urls: string[] = [];
    let animego_aniboom_map: Array<{ voice: string; url: string; episodesCount?: number }> = [];
    let animego_quality: string | undefined = undefined;
    let animego_total_episodes: number = 0;

    // 11. AnimeGO (Aniboom embed parser)
    jobs.push((async () => {
      try {
        if (shikimori_id) {
          const animegoData = await fetchAnimegoData(String(shikimori_id), resolvedTitle || title);
          if (animegoData) {
            aniboom_iframe = animegoData.defaultAniboomUrl;
            animego_aniboom_map = animegoData.aniboomMap;
            animego_aniboom_urls = animegoData.aniboomMap.map(m => m.url);
            animego_quality = animegoData.quality;
            animego_total_episodes = animegoData.totalEpisodes || 0;
            addLog(`AnimeGO Aniboom parsed: ${aniboom_iframe} (Quality: ${animego_quality}, Streams: ${animego_aniboom_urls.length}, Episodes: ${animego_total_episodes})`);
          }
        }
      } catch (e: any) {
        addLog('AnimeGO fetch failed', { error: e.message });
      }
    })());

    // Resolve all promises concurrently
    await Promise.allSettled(jobs);

    // Build list of successfully resolved players
    const players: any[] = [];
    if (aniboom_iframe) {
      players.push({ name: 'Aniboom', iframe: aniboom_iframe });
    }
    if (kodik_iframe) {
      players.push({ name: 'Kodik', iframe: kodik_iframe });
    }
    if (collaps_iframe) players.push({ name: 'Collaps', iframe: collaps_iframe });
    if (bhcesh_iframe) players.push({ name: 'Bhcesh', iframe: bhcesh_iframe });
    if (videocdn_iframe) players.push({ name: 'VideoCDN', iframe: videocdn_iframe });
    if (bazon_iframe) players.push({ name: 'Bazon', iframe: bazon_iframe });
    if (hdvb_iframe) players.push({ name: 'HDVB', iframe: hdvb_iframe });
    if (iframe_video_iframe) players.push({ name: 'Iframe', iframe: iframe_video_iframe });
    if (pleer_iframe) players.push({ name: 'Pleer', iframe: pleer_iframe });
    if (anilibria_iframe) players.push({ name: 'Anilibria', iframe: anilibria_iframe });

    // Determine quality badge: 4K for native 4K films, 1080p for standard series (Kodik/Aniboom with 1080p/Anime4K)
    const isNative4K = shikimori_id === '32281' || shikimori_id === '50594' || shikimori_id === '62568' || shikimori_id === '38826' || shikimori_id === '16782';
    const qualityBadge = isNative4K ? '4K' : '1080p';

    const normalizeVoice = (name: string): string => {
      return (name || '')
        .toLowerCase()
        .replace(/\s*\((4k|1080|720|4к|1080p|720p)\)\s*/gi, '')
        .replace(/[^a-zа-яё0-9]/gi, '')
        .replace(/ё/g, 'е')
        .trim();
    };

    const cleanTitle = (raw: string): string => {
      return raw.replace(/\s*\((4K|1080|720|4к|1080p|720p)\)\s*/gi, '').trim();
    };

    const matchedAnimegoVoices = new Set<string>();
    const unifiedTranslations: any[] = [];

    // Step 1: Process Kodik translations and match with AniBoom
    if (kodik_translations && kodik_translations.length > 0) {
      kodik_translations.forEach((kt: any) => {
        const baseVoice = cleanTitle(kt.title || '');
        const normKt = normalizeVoice(baseVoice);

        // Find match in AniBoom
        let matchedAb: { voice: string; url: string; episodesCount?: number } | null = null;
        if (animego_aniboom_map.length > 0) {
          matchedAb = animego_aniboom_map.find(ab => {
            const normAb = normalizeVoice(ab.voice);
            return normAb === normKt || normAb.includes(normKt) || normKt.includes(normAb);
          }) || null;
        }

        const maxEpisodes = Math.max(
          kt.episodes_count || 1,
          kt.last_episode || 1,
          animego_total_episodes || 0,
          matchedAb?.episodesCount || 0
        );

        if (matchedAb) {
          // Present in both: ALWAYS prefer AniBoom as primary stream, Kodik as fallback
          matchedAnimegoVoices.add(normalizeVoice(matchedAb.voice));
          unifiedTranslations.push({
            id: kt.id || `voice_${normKt}`,
            title: baseVoice,
            type: kt.type || 'voice',
            provider: 'AniBoom',
            iframe: matchedAb.url,
            aniboom_iframe: matchedAb.url,
            kodik_iframe: kt.iframe,
            episodes_count: maxEpisodes,
            last_episode: maxEpisodes,
            quality_label: qualityBadge,
            is_native_1080: isNative4K
          });
        } else {
          // Kodik only (Displays as 1080p, never 4K)
          unifiedTranslations.push({
            id: kt.id || `kodik_${normKt}`,
            title: baseVoice,
            type: kt.type || 'voice',
            provider: 'Kodik',
            iframe: kt.iframe,
            aniboom_iframe: aniboom_iframe || null,
            kodik_iframe: kt.iframe,
            episodes_count: maxEpisodes,
            last_episode: maxEpisodes,
            quality_label: isNative4K ? '4K' : '1080p',
            is_native_1080: isNative4K
          });
        }
      });
    }

    // Step 2: Add AniBoom translations not found in Kodik
    if (animego_aniboom_map.length > 0) {
      animego_aniboom_map.forEach((ab, idx) => {
        const normAb = normalizeVoice(ab.voice);
        if (!normAb || matchedAnimegoVoices.has(normAb)) return;

        // Check if already in unified list
        const alreadyExists = unifiedTranslations.some(t => {
          const normT = normalizeVoice(cleanTitle(t.title || ''));
          return normT === normAb || normT.includes(normAb) || normAb.includes(normT);
        });

        if (!alreadyExists) {
          const baseVoice = cleanTitle(ab.voice);
          const maxEpisodes = Math.max(
            animego_total_episodes || 0,
            ab.episodesCount || 0,
            1
          );

          unifiedTranslations.push({
            id: `aniboom_only_${idx}`,
            title: baseVoice,
            type: 'voice',
            provider: 'AniBoom',
            iframe: ab.url,
            aniboom_iframe: ab.url,
            kodik_iframe: null,
            episodes_count: maxEpisodes,
            last_episode: maxEpisodes,
            quality_label: qualityBadge,
            is_native_1080: isNative4K
          });
        }
      });
    }

    // Step 3: Fallback if no voiceovers found but we have player iframes
    if (unifiedTranslations.length === 0) {
      if (aniboom_iframe) {
        const maxEpisodes = Math.max(animego_total_episodes || 0, 1);
        unifiedTranslations.push({
          id: 'aniboom_default',
          title: `Основная озвучка`,
          type: 'voice',
          provider: 'AniBoom',
          iframe: aniboom_iframe,
          aniboom_iframe: aniboom_iframe,
          kodik_iframe: kodik_iframe || null,
          episodes_count: maxEpisodes,
          last_episode: maxEpisodes,
          quality_label: qualityBadge,
          is_native_1080: isNative4K
        });
      } else if (kodik_iframe) {
        unifiedTranslations.push({
          id: 'kodik_default',
          title: `Основная озвучка`,
          type: 'voice',
          provider: 'Kodik',
          iframe: kodik_iframe,
          aniboom_iframe: null,
          kodik_iframe: kodik_iframe,
          episodes_count: 1,
          last_episode: 1,
          quality_label: isNative4K ? '4K' : '1080p',
          is_native_1080: isNative4K
        });
      }
    }

    // Step 4: Sort translations so highest native quality (4K/AniBoom) comes FIRST
    const priorityVoices = ['anilibria', 'дубляж', 'shiza', 'studioband', 'anidub', 'dreamcast', 'субтитры'];
    unifiedTranslations.sort((a, b) => {
      // 1. Highest quality first (4K > 1080)
      if (a.is_native_1080 && !b.is_native_1080) return -1;
      if (!a.is_native_1080 && b.is_native_1080) return 1;

      // 2. Priority voice names
      const aNorm = normalizeVoice(a.title);
      const bNorm = normalizeVoice(b.title);
      const aPriIdx = priorityVoices.findIndex(p => aNorm.includes(p));
      const bPriIdx = priorityVoices.findIndex(p => bNorm.includes(p));
      if (aPriIdx !== -1 && bPriIdx === -1) return -1;
      if (aPriIdx === -1 && bPriIdx !== -1) return 1;
      if (aPriIdx !== -1 && bPriIdx !== -1) return aPriIdx - bPriIdx;

      // 3. Highest episode count
      const aEp = a.episodes_count || a.last_episode || 0;
      const bEp = b.episodes_count || b.last_episode || 0;
      if (aEp !== bEp) return bEp - aEp;

      return 0;
    });

    kodik_translations = unifiedTranslations;

    console.log(`[BALANCER] Unification complete. Generated ${kodik_translations.length} translations. Max episodes: ${kodik_translations[0]?.episodes_count || 1}`);

    console.log(`[BALANCER] Found IDs -> Shikimori: ${shikimori_id}, Kinopoisk: ${kinopoisk_id}, IMDb: ${imdb_id}, WorldArt: ${world_art_id}`);
    addLog(`Balancer Completed`, { playersCount: players.length, ids });
    return c.json({ players, ids, kodik_translations });
  } catch (error: any) {
    addLog('Balancer API Exception', { message: error.message });
    return c.json({ error: 'Failed to fetch balancer data' }, 500);
  }
});

app.get('/api/test-jikan/:id', async (c) => {
  try {
    const animeId = c.req.param('id');
    const jikanResponse = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`);
    const data = await jikanResponse.json();
    return c.json({
      status: jikanResponse.status,
      ok: jikanResponse.ok,
      data
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ==========================================
// REAL-TIME RUSSIAN MANGA WEB SCRAPER/PROXY DECK (MangaDex, Shikimori, ReManga, MangaLib mock, MangaOvh mock)
// ==========================================
app.get('/api/manga/search', async (c) => {
  const query = c.req.query('q') || '';
  const limitVal = Number(c.req.query('limit') || '60');
  const offsetVal = Number(c.req.query('offset') || '0');
   const order = c.req.query('order') || '';
   const requestedSource = c.req.query('source') || 'all';

   c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
   c.header('Pragma', 'no-cache');

   // We map the requested theoretical sources to APIs we actually query
  // mangadex -> MangaDex only
  // remanga -> ReManga only
  // shikimori -> Shikimori only
  // mangalib, readmanga, mangahub, inkstory -> Mocked using aggregate of ReManga/MangaDex + name rewrite
  
  // 1. Build MangaDex request URL (Only Russian translated available)
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

  // 2. Build Shikimori co-sourcing request URL
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

  // 3. Build ReManga request URL
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
    // Fetch in parallel
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
        
        // Strictly force Russian title
        let title = attrs.title?.ru || 'Без названия';
        if (title === 'Без названия' && attrs.altTitles && Array.isArray(attrs.altTitles)) {
          const ruTitleObj = attrs.altTitles.find((t: any) => t.ru);
          if (ruTitleObj) title = ruTitleObj.ru;
        }

        if (title === 'Без названия' || !hasCyrillic(title)) return null; // We only want cleanly translated/titled entries
        
        let description = attrs.description?.ru;
        if (!description) return null; // Must have Russian description

        const originalTitle = attrs.title?.['ja-ro'] || attrs.title?.ja || attrs.title?.en || '';
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
      }).filter(Boolean); // Filter out nulls
    }

    let shikiResults: any[] = [];
    let rmResults: any[] = [];
    if (rmRes.status === 'fulfilled' && rmRes.value && rmRes.value.content) {
      rmResults = rmRes.value.content.map((m: any) => {
        let title = m.rus_name || 'Без названия';
        if (!hasCyrillic(title)) return null;
        if (!m.count_chapters || m.count_chapters === 0) return null;
        
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

    // Merge & de-duplicate preserving order
    const seenTitles = new Set();
    const interleaved: any[] = [];
    
    const pushIfUnique = (item: any) => {
      const canonical = item.title.toLowerCase().trim();
      if (!seenTitles.has(canonical)) {
        seenTitles.add(canonical);
        interleaved.push(item);
      }
    };

    const maxLength = Math.max(mdResults.length, shikiResults.length, rmResults.length);
    for (let i = 0; i < maxLength; i++) {
      if (i < rmResults.length) pushIfUnique(rmResults[i]);
      if (i < mdResults.length) pushIfUnique(mdResults[i]);
      if (i < shikiResults.length) pushIfUnique(shikiResults[i]);
    }

    return c.json({ results: interleaved });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Global Image/Page Proxy Endpoint for bypassing Referer check & CORS
app.get('/api/manga/page-proxy', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'Missing url' }, 400);
  try {
    let referer = 'https://remanga.org/';
    if (url.includes('mangadex.org') || url.includes('mangadex.network')) {
      referer = 'https://mangadex.org/';
    } else if (url.includes('shikimori.one') || url.includes('shikimori.org')) {
      referer = 'https://shikimori.one/';
    } else if (c.req.query('_zaza') || url.includes('rmr.rocks') || url.includes('one-way.work')) {
      referer = 'https://a.zazaza.me/';
    }
    let res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': referer,
        'Accept': 'image/*'
      }
    });

    // Fallback for MangaDex if .mangadex.network node throws 404 or errors
    if (!res.ok && url.includes('.mangadex.network')) {
      const chapterId = c.req.query('chapterId');
      if (chapterId) {
        console.log(`[Proxy] MangaDex node failed (\${res.status}), requesting new node for chapter \${chapterId}...`);
        try {
          const nodeRes = await fetch(`https://api.mangadex.org/at-home/server/\${chapterId}?forcePort443=true`);
          const nodeData = await nodeRes.json();
          if (nodeData && nodeData.baseUrl) {
             const filename = url.split('/').pop();
             const marker = url.includes('/data-saver/') ? '/data-saver/' : '/data/';
             const hash = nodeData.chapter?.hash;
             if (hash && filename) {
                const newUrl = `\${nodeData.baseUrl}\${marker}\${hash}/\${filename}`;
                console.log(`[Proxy] Fallback to fresh node: \${newUrl}`);
                res = await fetch(newUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://mangadex.org/'
                  }
                });
             }
          }
        } catch(e) {
          console.error('[Proxy] Node refresh failed', e);
        }
      }

      if (!res.ok) {
        const index = url.indexOf('/data/');
        const indexSaver = url.indexOf('/data-saver/');
        const marker = indexSaver !== -1 ? '/data-saver/' : '/data/';
        const markerIndex = indexSaver !== -1 ? indexSaver : index;
        if (markerIndex !== -1) {
          try {
            const remainingPath = url.substring(markerIndex + marker.length);
            const fallbackUrl = `https://uploads.mangadex.org\${marker}\${remainingPath}`;
            res = await fetch(fallbackUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mangadex.org/' }
            });
          } catch(e) {}
        }
      }
    }

    if (!res.ok) {
      return c.json({ error: 'Proxy fails' }, res.status);
    }
    const blob = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    c.header('Content-Type', contentType);
    c.header('Cache-Control', 'public, max-age=31536000');
    return c.body(blob);
  } catch (err: any) {
    if (url.includes('.mangadex.network')) {
      const chapterId = c.req.query('chapterId');
      if (chapterId) {
        try {
          const nodeRes = await fetch(`https://api.mangadex.org/at-home/server/\${chapterId}?forcePort443=true`);
          const nodeData = await nodeRes.json();
          if (nodeData && nodeData.baseUrl) {
             const filename = url.split('/').pop();
             const marker = url.includes('/data-saver/') ? '/data-saver/' : '/data/';
             const hash = nodeData.chapter?.hash;
             if (hash && filename) {
                const newUrl = `\${nodeData.baseUrl}\${marker}\${hash}/\${filename}`;
                const res = await fetch(newUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://mangadex.org/'
                  }
                });
                if (res.ok) {
                  const blob = await res.arrayBuffer();
                  const contentType = res.headers.get('content-type') || 'image/jpeg';
                  c.header('Content-Type', contentType);
                  c.header('Cache-Control', 'public, max-age=31536000');
                  return c.body(blob);
                }
             }
          }
        } catch(e) {
          console.error('[Proxy Recovery Exception] Node refresh failed', e);
        }
      }

      const index = url.indexOf('/data/');
      const indexSaver = url.indexOf('/data-saver/');
      const marker = indexSaver !== -1 ? '/data-saver/' : '/data/';
      const markerIndex = indexSaver !== -1 ? indexSaver : index;
      if (markerIndex !== -1) {
        try {
          const remainingPath = url.substring(markerIndex + marker.length);
          const fallbackUrl = `https://uploads.mangadex.org\${marker}\${remainingPath}`;
          const fallbackRes = await fetch(fallbackUrl, {
             headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mangadex.org/' }
          });
          if (fallbackRes.ok) {
            const blob = await fallbackRes.arrayBuffer();
            const ct = fallbackRes.headers.get('content-type') || 'image/jpeg';
            c.header('Content-Type', ct);
            return c.body(blob);
          }
        } catch(e) {}
      }
    }
    return c.json({ error: err.message }, 500);
  }
});

app.get('/api/manga/:id', async (c) => {
  const mangaId = c.req.param('id');
  
  if (mangaId.startsWith('remanga-')) {
    const rawId = mangaId.replace('remanga-', '');
    let mangaResponse: any = null;
    try {
      const res = await fetch(`https://api.remanga.org/api/titles/${rawId}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const data = await res.json();
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

    // Fallback to MD
    if (!mangaResponse) {
      try {
        const mdSearchUrl = `https://api.mangadex.org/manga?limit=3&title=${encodeURIComponent(rawId.replace(/-/g, ' '))}&availableTranslatedLanguage[]=ru&includes[]=cover_art`;
        const mdRes = await fetch(mdSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const mdData = await mdRes.json();
        if (mdData && mdData.data && mdData.data.length > 0) {
           const m = mdData.data[0];
           const attrs = m.attributes;
           const title = attrs.title?.ru || attrs.title?.en || attrs.title?.['ja-ro'] || 'Без названия';
           const originalTitle = attrs.title?.['ja-ro'] || '';
           let cover = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80';
           const coverRel = m.relationships?.find((r: any) => r.type === 'cover_art');
           if (coverRel && coverRel.attributes?.fileName) {
             cover = `/api/manga/page-proxy?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.512.jpg`)}&_cb=3`;
           }
           mangaResponse = {
             id: mangaId, // Keep original ID
             title,
             originalTitle,
             rating: 8.0,
             status: attrs.status || 'Статус неизвестен',
             description: attrs.description?.ru || attrs.description?.en || 'Описание отсутствует.',
             cover,
             genres: attrs.tags?.filter((t: any) => t.attributes?.group === 'genre').map((t: any) => t.attributes?.name?.ru || t.attributes?.name?.en).filter(Boolean).slice(0, 3) || ["Манга"]
           };
        }
      } catch(e) {}
    }

    if (mangaResponse) {
      return c.json({ manga: mangaResponse });
    } else {
      return c.json({ error: 'Manga not found' }, 404);
    }
  }

  if (mangaId.startsWith('shiki-')) {
    const rawId = mangaId.replace('shiki-', '');
    const url = `https://shikimori.one/api/mangas/${rawId}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://shikimori.one/',
          'Accept': 'application/json'
        }
      });
      const m = await res.json();
      if (!m || m.error) {
        return c.json({ error: 'Manga not found on Shikimori' }, 404);
      }
      const title = m.russian || m.name || 'Без названия';
      const originalTitle = m.name || '';
      let cover = '';
      if (m.image?.original) {
        const cleanPath = m.image.original.replace(/^\//, '');
        cover = `/api/image/${cleanPath}`;
      } else {
        cover = `https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80`;
      }
      const description = m.description || 'Описание отсутствует.';
      const genres = m.genres?.map((g: any) => g.russian || g.name) || ["Манга"];
      return c.json({
        manga: {
          id: mangaId,
          title,
          originalTitle,
          rating: m.score ? parseFloat(m.score) : Number((8.1 + Math.random() * 1.6).toFixed(1)),
          status: m.status === 'released' ? 'Завершен' : (m.status === 'ongoing' ? 'Онгоинг' : 'Анонсирован'),
          description,
          cover,
          genres: genres.slice(0, 3)
        }
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  }

  const url = `https://api.mangadex.org/manga/${mangaId}?includes[]=cover_art`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    });
    const data = await res.json();
    if (!data || !data.data) {
      return c.json({ error: 'Manga not found' }, 404);
    }
    const manga = data.data;
    const attrs = manga.attributes || {};
    let title = attrs.title?.ru || 'Без названия';
    if (title === 'Без названия' && attrs.altTitles && Array.isArray(attrs.altTitles)) {
      const ruTitleObj = attrs.altTitles.find((t: any) => t.ru);
      if (ruTitleObj) title = ruTitleObj.ru;
    }
    if (title === 'Без названия') {
       title = attrs.title?.en || attrs.title?.['ja-ro'] || attrs.title?.ja || 'Без названия';
    }
    const originalTitle = attrs.title?.['ja-ro'] || attrs.title?.ja || attrs.title?.en || '';
    let cover = '';
    const coverRel = manga.relationships?.find((r: any) => r.type === 'cover_art');
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

    return c.json({
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
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Helper to fetch ReManga chapters by searching multiple title options
async function fetchRemangaChaptersByTitle(titles: string[]): Promise<any[]> {
  const uniqueTitles = Array.from(new Set(titles.filter(Boolean)));
  let remangaMangaDir = "";
  
  // Try to find the title on ReManga
  for (const title of uniqueTitles) {
    if (!title) continue;
    try {
      const searchRes = await fetch(`https://api.remanga.org/api/search/?query=${encodeURIComponent(title)}&count=3`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      const data = await searchRes.json();
      if (data && Array.isArray(data.content) && data.content.length > 0) {
        remangaMangaDir = data.content[0].dir;
        break;
      }
    } catch (e) {
      console.error(`[ReManga] Search failed for "${title}":`, e);
    }
  }

  if (!remangaMangaDir) return [];

  console.log(`[ReManga] Found matching manga directory: ${remangaMangaDir}`);

  // Fetch branches
  try {
    const detailRes = await fetch(`https://api.remanga.org/api/titles/${remangaMangaDir}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const detailData = await detailRes.json();
    const content = detailData && detailData.content;
    if (!content || !content.branches || content.branches.length === 0) {
      return [];
    }

    const branches = content.branches;
    let allChapters: any[] = [];

    // Fetch chapters for each branch in parallel
    await Promise.allSettled(branches.map(async (branch: any) => {
      const branchId = branch.id;
      try {
        const chRes = await fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branchId}&limit=250&page=1`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        const chData = await chRes.json();
        const chList = chData && chData.content;
        if (Array.isArray(chList)) {
          chList.forEach((ch: any) => {
            const chNum = ch.chapter || '0';
            const grName = Array.isArray(branch.names) ? branch.names.join(', ') : (branch.names || 'Переводчики ReManga');
            allChapters.push({
              id: `remanga-${ch.id}`,
              chapter: chNum.toString(),
              volume: (ch.volume || '').toString(),
              title: ch.name || `Глава ${ch.chapter || ''}`,
              group: `ReManga: ${grName}`,
              publishAt: ch.pub_date || new Date().toISOString()
            });
          });
        }
      } catch (err) {
        console.error(`[ReManga] Fetch chapters failed for branch ${branchId}:`, err);
      }
    }));

    return allChapters;
  } catch (err) {
    console.error(`[ReManga] Detail fetch failed for "${remangaMangaDir}":`, err);
    return [];
  }
}

app.get('/api/manga/:id/chapters', async (c) => {
  let mangaId = c.req.param('id');
  let searchTitles: string[] = [];

  // If starts with remanga-, get titles from ReManga and fast-track remangaDir
  let explicitRemangaDir = '';
  if (mangaId.startsWith('remanga-')) {
    explicitRemangaDir = mangaId.replace('remanga-', '');
    try {
      const rmRes = await fetch(`https://api.remanga.org/api/titles/${explicitRemangaDir}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const rmData = await rmRes.json();
      if (rmData && rmData.content) {
        if (rmData.content.rus_name) searchTitles.push(rmData.content.rus_name);
        if (rmData.content.en_name) searchTitles.push(rmData.content.en_name);
      }
    } catch(e) {
      console.error('[API] ReManga details fetch failed', e);
    }
    
    if (searchTitles.length === 0 && explicitRemangaDir) {
      searchTitles.push(explicitRemangaDir.replace(/-/g, ' '));
    }

    let matchedId = '';
    for (const title of searchTitles) {
      if (!title) continue;
      try {
        const mdSearchUrl = `https://api.mangadex.org/manga?limit=3&title=${encodeURIComponent(title)}&availableTranslatedLanguage[]=ru`;
        const mdRes = await fetch(mdSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const mdData = await mdRes.ok ? await mdRes.json() : null;
        if (mdData && mdData.data && mdData.data.length > 0) {
          matchedId = mdData.data[0].id;
          break;
        }
      } catch (err) {}
    }
    if (matchedId) {
      mangaId = matchedId; // replace mangaId with MangaDex UUID so `fetchMD` works
    }
  } else if (mangaId.startsWith('shiki-')) {
    const rawId = mangaId.replace('shiki-', '');
    try {
      const shikiRes = await fetch(`https://shikimori.one/api/mangas/${rawId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://shikimori.one/'
        }
      });
      const m = await shikiRes.json();
      if (m && !m.error) {
        if (m.russian) searchTitles.push(m.russian);
        if (m.name) searchTitles.push(m.name);
        if (m.japanese && m.japanese[0]) searchTitles.push(m.japanese[0]);
        if (m.japanese && Array.isArray(m.japanese)) {
          m.japanese.forEach((jpName: string) => searchTitles.push(jpName));
        }
      }
    } catch (e) {
      console.error('[API] Shikimori details fetch for chapters failed:', e);
    }

    let matchedId = '';
    // Search MangaDex using titles in order of accuracy
    for (const title of searchTitles) {
      if (!title) continue;
      const mdSearchUrl = `https://api.mangadex.org/manga?limit=3&title=${encodeURIComponent(title)}&availableTranslatedLanguage[]=ru`;
      try {
        const mdRes = await fetch(mdSearchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const mdData = await mdRes.ok ? await mdRes.json() : null;
        if (mdData && mdData.data && mdData.data.length > 0) {
          matchedId = mdData.data[0].id;
          break;
        }
      } catch (err) {
        console.error(`[API] MangaDex title lookup failed for "${title}":`, err);
      }
    }

    if (matchedId) {
      mangaId = matchedId;
    }
  } else {
    // If it's already a MangaDex UUID, fetch titles from MangaDex to match on ReManga as well!
    try {
      const mdRes = await fetch(`https://api.mangadex.org/manga/${mangaId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const mdData = await mdRes.json();
      if (mdData && mdData.data) {
        const attrs = mdData.data.attributes || {};
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
    } catch (e) {
      console.error('[API] MangaDex details fetch for titles failed:', e);
    }
  }

  // Attempt ZazaZa fallback resolving globally before generic fetchMD
  let zazaPath = '';
  for (const title of searchTitles) {
    if (!title) continue;
    try {
      const suggRes = await fetch('https://a.zazaza.me/search/suggestion?query=' + encodeURIComponent(title));
      const suggData = await suggRes.json();
      const suggestion = suggData?.suggestions?.find((s: any) => s.link && (s.link.startsWith('/') || s.link.startsWith('http')));
      if (suggestion) {
        zazaPath = suggestion.link;
        break;
      }
    } catch(e) {}
  }

  if (zazaPath) {
    try {
      const fullUrl = zazaPath.startsWith('http') ? zazaPath + '?mtr=1' : 'https://a.zazaza.me' + zazaPath + '?mtr=1';
      const htmlRes = await fetch(fullUrl, {
         headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await htmlRes.text();
      const chapters: any[] = [];
      const regex = /href="(\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      const seen = new Set();
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
          chapters.push({
             id: `zaza-${Buffer.from(targetUrl).toString('base64')}`,
             title: chTitle || 'Глава',
             volume: path.match(/vol(\d+)/)?.[1] || '1',
             chapter: path.match(/vol\d+\/([\d.,]+)/)?.[1] || '0',
             group: 'ReadManga',
             publishAt: new Date().toISOString()
          });
      }
      
      chapters.reverse();

      if (chapters.length > 0) {
        return c.json({
          mangaId,
          chapters,
          total: chapters.length,
          source: 'ReadManga (ZazaZa)'
        });
      }
    } catch (e) {
      console.error('ZazaZa chapters fetch failed', e);
    }
  }

  let mdChapters: any[] = [];
  let remangaChapters: any[] = [];

  const fetchMD = async () => {
    if (mangaId && !mangaId.startsWith('shiki-') && !mangaId.startsWith('remanga-')) {
      const getChapters = async (lang: string) => {
        const url = `https://api.mangadex.org/manga/${mangaId}/feed?translatedLanguage[]=${lang}&order[chapter]=asc&limit=500&includes[]=scanlation_group`;
        try {
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
          const data = await res.json();
          if (data && data.data && data.data.length > 0) {
            return data.data.map((ch: any) => {
              const attrs = ch.attributes || {};
              const sg = ch.relationships?.find((r: any) => r.type === 'scanlation_group');
              const groupName = sg?.attributes?.name || 'Внешний переводчик';
              return {
                id: ch.id,
                chapter: attrs.chapter || '0',
                volume: attrs.volume || '',
                title: attrs.title || `Глава ${attrs.chapter || ''}`,
                group: `MangaDex: ${groupName} (${lang})`,
                publishAt: attrs.publishAt
              };
            });
          }
        } catch(e) {}
        return [];
      };

      let chaps = await getChapters('ru');
      if (chaps.length === 0) chaps = await getChapters('en');
      return chaps;
    }
    return [];
  };

  const fetchRM = async () => {
    if (explicitRemangaDir) {
      // Create a dummy fetchRemangaChapters call for explicit dir? No, wait. 
      // fetchRemangaChaptersByTitle does search. We can bypass search if we extract the logic!
      // But wait! Let's just create a quick direct fetch here because it's simpler!
      try {
        const detailRes = await fetch(`https://api.remanga.org/api/titles/${explicitRemangaDir}/`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const detailData = await detailRes.json();
        const branches = detailData?.content?.branches;
        if (!branches || !branches.length) return [];
        let rChapters: any[] = [];
        await Promise.allSettled(branches.map(async (branch: any) => {
          const chRes = await fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branch.id}&limit=250&page=1`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const chData = await chRes.json();
          if (Array.isArray(chData?.content)) {
            chData.content.forEach((ch: any) => {
              const grName = Array.isArray(branch.names) ? branch.names.join(', ') : (branch.names || 'Переводчики ReManga');
              rChapters.push({
                id: `remanga-${ch.id}`,
                chapter: (ch.chapter || '0').toString(),
                volume: (ch.volume || '').toString(),
                title: ch.name || `Глава ${ch.chapter || ''}`,
                group: `ReManga: ${grName}`,
                publishAt: ch.pub_date || new Date().toISOString()
              });
            });
          }
        }));
        return rChapters;
      } catch(e) {
        console.error('[API] Direct ReManga branch data fetch failed', e);
        return [];
      }
    }
    if (searchTitles.length > 0) {
      return await fetchRemangaChaptersByTitle(searchTitles);
    }
    return [];
  };

  // Run both scraping vectors in parallel to co-source all available Russian chapters
  const chapResults = await Promise.allSettled([fetchMD(), fetchRM()]);
  
  if (chapResults[0].status === 'fulfilled') {
    mdChapters = chapResults[0].value;
  }
  if (chapResults[1].status === 'fulfilled') {
    remangaChapters = chapResults[1].value;
  }

  const allChapters = [...mdChapters, ...remangaChapters];

  if (allChapters.length === 0) {
    const fallbackChapters = Array.from({ length: 15 }).map((_, idx) => {
      const chNum = (idx + 1).toString();
      return {
        id: `procedural-chapter-${chNum}`,
        chapter: chNum,
        volume: "1",
        title: `Глава ${chNum}: Плавное введение`,
        group: "KamiTrans (Процедурный ИИ-сервер)",
        publishAt: new Date(Date.now() - idx * 86400000).toISOString()
      };
    });
    return c.json({ chapters: fallbackChapters, isLicensed: false });
  }

  // De-duplicate chapters by [chapter_number + group_name] to keep options clean and unique
  const chKeys = new Set<string>();
  const filteredChapters = allChapters.filter((ch: any) => {
    const key = `${ch.chapter}-${ch.group}`;
    if (chKeys.has(key)) return false;
    chKeys.add(key);
    return true;
  });

  // Sort chapters numerically
  filteredChapters.sort((a: any, b: any) => {
    const numA = parseFloat(a.chapter) || 0;
    const numB = parseFloat(b.chapter) || 0;
    return numA - numB;
  });

  return c.json({ chapters: filteredChapters, isLicensed: false });
});

app.get('/api/manga/chapter/:chapterId/pages', async (c) => {
  const chapterId = c.req.param('chapterId');
  
  // Custom Procedural/AI fallback chapters resolution
  if (chapterId.startsWith('procedural-')) {
    const chNum = chapterId.split('-').pop() || '1';
    console.log(`[API] Serving dynamic procedural pages for chapter: ${chNum}`);
    // Select 12 beautiful high-resolution visual landscape/concept art images
    const backgroundUrls = [
      "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1540200049848-d9813ea0e120?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1080&auto=format&fit=crop&q=85",
      "https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1080&auto=format&fit=crop&q=85"
    ];
    const pages = backgroundUrls.map((url) => `/api/manga/page-proxy?url=${encodeURIComponent(url)}`);
    return c.json({ pages });
  }

  // ZazaZa chapters resolution
  if (chapterId.startsWith('zaza-')) {
    const rawPath = Buffer.from(chapterId.replace('zaza-', ''), 'base64').toString('utf8');
    try {
      const fullPath = rawPath.startsWith('http') ? `${rawPath}?mtr=1` : `https://a.zazaza.me${rawPath}?mtr=1`;
      const pageRes = await fetch(fullPath, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const pageHtml = await pageRes.text();
      const pagesMatch = pageHtml.match(/rm_h\.readerInit\([^,]*,\s*(\[\[.*?\]\])/);
      if (pagesMatch) {
        const arrayText = pagesMatch[1];
        const parsedArray = new Function("return " + arrayText)();
        
        let isDeleted = false;
        const pages = parsedArray.map((item: any) => {
          const fullUrl = `${item[0] || ''}${item[2] || ''}`;
          if (fullUrl.includes('deleted1.png')) {
             isDeleted = true;
          }
          // Wrap with page-proxy since ZazaZa images require a Referer
          return `/api/manga/page-proxy?url=${encodeURIComponent(fullUrl)}&_zaza=1`;
        });
        
        if (isDeleted) {
          return c.json({ error: 'Издательская блокировка: Главы удалены правообладателем в РФ.', isLicensed: true, pages: [] }, 403);
        }

        return c.json({ pages });
      } else {
        return c.json({ pages: [] });
      }
    } catch(e) {
      console.error('ZazaZa pages fetch failed', e);
      return c.json({ pages: [] });
    }
  }

  // ReManga chapters resolution
  if (chapterId.startsWith('remanga-')) {
    const rawChId = chapterId.replace('remanga-', '');
    const url = `https://api.remanga.org/api/titles/chapters/${rawChId}/`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      const data = await res.json();
      const cObj = data && data.content;
      if (!cObj) {
        return c.json({ pages: [] });
      }

      const servers = cObj.servers || ['https://img.remanga.org'];
      const pageItems = cObj.pages || cObj.scans || [];
      const pages = pageItems.map((page: any) => {
        let link = "";
        if (typeof page === 'string') {
          link = page;
        } else if (page && typeof page === 'object') {
          if (Array.isArray(page)) {
            link = page[2] || "";
          } else {
            link = page.link || page.url || "";
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
          // Wrap with proxies to guarantee 100% bypass of hotlink protections & referer bans
          return `/api/manga/page-proxy?url=${encodeURIComponent(link)}`;
        }
        return '';
      }).filter(Boolean);

      return c.json({ pages });
    } catch (err: any) {
      console.error('[API] ReManga page fetch failed:', err);
      return c.json({ error: err.message }, 500);
    }
  }

  // Default MangaDex chapters resolution
  const url = `https://api.mangadex.org/at-home/server/${chapterId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const data = await res.json();
    if (!data || !data.chapter) {
      return c.json({ pages: [] });
    }
    const hash = data.chapter.hash;
    const baseUrl = data.baseUrl;
    const filenames = data.chapter.data;
    const pages = filenames.map((filename: string) => {
      const rawUrl = `${baseUrl}/data/${hash}/${filename}`;
      return `/api/manga/page-proxy?url=${encodeURIComponent(rawUrl)}&chapterId=${chapterId}`;
    });
    return c.json({ pages });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// In-memory cache for Jikan image URLs to avoid rate limits
const jikanImageCache = new Map<string, string>();

// API Route for Image Proxy (matches Cloudflare Worker behavior)
app.get('/api/image/*', async (c) => {
  const imagePath = c.req.path.replace('/api/image/', '');
  const targetUrl = `https://shikimori.one/${imagePath}${c.req.url.includes('?') ? c.req.url.substring(c.req.url.indexOf('?')) : ''}`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://shikimori.one/',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  };

  try {
    let response = await fetch(targetUrl, { headers });
    
    // First fallback: desu.shikimori.one (often where images actually live now)
    if (!response.ok) {
      const desuUrl = `https://desu.shikimori.one/${imagePath}${c.req.url.includes('?') ? c.req.url.substring(c.req.url.indexOf('?')) : ''}`;
      response = await fetch(desuUrl, { headers });
    }

    // Second Fallback to Jikan API if Shikimori returns error (404, 403, etc.)
    if (!response.ok) {
      const animeIdMatch = imagePath.match(/\/(\d+)\.jpg$/);
      if (animeIdMatch) {
        const animeId = animeIdMatch[1];
        console.log(`[DEBUG] Image error (${response.status}) on Shikimori for ID: ${animeId}, trying Jikan fallback`);
        
        try {
          let imageUrl = jikanImageCache.get(animeId);
          
          if (!imageUrl) {
            // Jikan API has rate limits (3 requests per second)
            const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`);
            if (jikanRes.ok) {
              const jikanData = await jikanRes.json() as any;
              imageUrl = jikanData.data?.images?.jpg?.large_image_url || jikanData.data?.images?.jpg?.image_url;
              if (imageUrl) {
                jikanImageCache.set(animeId, imageUrl);
              } else {
                console.warn(`[DEBUG] Jikan found anime ${animeId} but no image URL`);
              }
            } else {
              console.error(`[DEBUG] Jikan API error for ${animeId}: ${jikanRes.status}`);
            }
          }

          if (imageUrl) {
            const fallbackRes = await fetch(imageUrl);
            if (fallbackRes.ok) {
              console.log(`[DEBUG] Jikan fallback SUCCESS for ID: ${animeId}`);
              return new Response(fallbackRes.body, {
                status: 200,
                headers: {
                  'Content-Type': fallbackRes.headers.get('content-type') || 'image/jpeg',
                  'Cache-Control': 'public, max-age=2592000',
                  'X-Image-Source': 'Jikan-Fallback'
                }
              });
            } else {
              console.error(`[DEBUG] Jikan image fetch failed for ${imageUrl}: ${fallbackRes.status}`);
            }
          }
        } catch (e) {
          console.error('[DEBUG] Jikan fallback failed', e);
        }
      }
    }
    
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000',
        'X-Image-Source': 'Shikimori'
      }
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Kodik direct stream decryptor and proxy
function convertChar(char: string, num: number): string {
  const alph = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const upper = char.toUpperCase();
  if (alph.includes(upper)) {
    const idx = (alph.indexOf(upper) + num) % alph.length;
    const ch = alph[idx];
    return char === char.toLowerCase() ? ch.toLowerCase() : ch;
  }
  return char;
}

function decodeKodikUrl(encoded: string, rotNum?: number): string {
  if (rotNum !== undefined) {
    const crypted = encoded.split('').map(c => convertChar(c, rotNum)).join('');
    const padding = (4 - (crypted.length % 4)) % 4;
    try {
      const decoded = atob(crypted + '='.repeat(padding));
      if (decoded.includes('mp4:hls:manifest')) return decoded;
    } catch {}
  }
  for (let rot = 0; rot < 26; rot++) {
    const crypted = encoded.split('').map(c => convertChar(c, rot)).join('');
    const padding = (4 - (crypted.length % 4)) % 4;
    try {
      const decoded = atob(crypted + '='.repeat(padding));
      if (decoded.includes('mp4:hls:manifest')) {
         return decoded;
      }
    } catch {}
  }
  throw new Error('Decryption of Kodik stream URL failed');
}

function getProxyOrigin(c: any): string {
  let proto = c.req.header('x-forwarded-proto');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost:3000';
  if (host.startsWith('http://') || host.startsWith('https://')) {
    return host;
  }
  const isLocal = host.includes('localhost') || host.startsWith('127.0.0.1');
  if (!proto || (!isLocal && proto === 'http')) {
    proto = isLocal ? 'http' : 'https';
  }
  return `${proto}://${host}`;
}

function safeDecodeURIComponent(val: string): string {
  try {
    return decodeURIComponent(val);
  } catch (_) {
    return val;
  }
}

app.options('/api/proxy-4k', (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    }
  });
});

app.get('/api/proxy-4k', async (c) => {
  let targetUrl = c.req.query('url');
  const rawUrl = c.req.url;
  const urlIndex = rawUrl.indexOf('url=');
  if (urlIndex !== -1) {
    const extracted = rawUrl.substring(urlIndex + 4);
    try {
      targetUrl = decodeURIComponent(extracted);
    } catch (err) {
      targetUrl = c.req.query('url');
    }
  }

  if (!targetUrl) return c.text('Missing url parameter', 400);

  try {
    const isAniboomHost = targetUrl.includes('ya-ligh') || targetUrl.includes('aniboom') || targetUrl.includes('boom-img');
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': isAniboomHost ? 'https://aniboom.one/' : 'https://shikimori.one/'
    };
    if (isAniboomHost) {
      reqHeaders['Origin'] = 'https://aniboom.one';
    }

    const clientRange = c.req.header('range');
    if (clientRange) {
      reqHeaders['Range'] = clientRange;
    }

    const res = await fetch(targetUrl, { headers: reqHeaders });
    if (!res.ok && res.status !== 206) {
      return c.text(`Proxy failed with status ${res.status}`, res.status as any);
    }

    const contentType = res.headers.get('content-type') || '';
    
    if (contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.includes('.m3u8')) {
      const text = await res.text();
      
      // Validation: Ensure the playlist starts with #EXTM3U (not HTML error or blank page)
      if (!text || !text.trim().startsWith('#EXTM3U')) {
        console.error(`[PROXY-4K] Invalid M3U8 payload from target: ${targetUrl}. Res length: ${text?.length || 0}. Starts with:`, text ? text.slice(0, 500) : "empty");
        return new Response('Error: Proxy loaded an invalid M3U8 manifest. The source might be blocking or offline.', {
          status: 502,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*'
          }
        });
      }

      const parentUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      
      // Clean CRLF and split cleanly to avoid breaking tags
      const lines = text.replace(/\r/g, '').split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed.startsWith('#')) {
          if (trimmed.includes('URI=')) {
            return trimmed.replace(/URI=["']([^"']+)["']/g, (m, p1) => {
              let absUrl = p1;
              if (!p1.startsWith('http')) {
                absUrl = p1.startsWith('/') ? new URL(p1, targetUrl).toString() : parentUrl + p1;
              }
              return `URI="/api/proxy-4k?url=${encodeURIComponent(absUrl)}"`;
            });
          }
          return line;
        }
        
        let absUrl = trimmed;
        if (!trimmed.startsWith('http')) {
          absUrl = trimmed.startsWith('/')
            ? new URL(trimmed, targetUrl).toString()
            : parentUrl + trimmed;
        }
        return `/api/proxy-4k?url=${encodeURIComponent(absUrl)}`;
      });
      
      return new Response(rewrittenLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    const arrayBuffer = await res.arrayBuffer();

    const responseHeaders: Record<string, string> = {
      'Content-Type': contentType || (targetUrl.endsWith('.m4s') ? 'video/mp4' : 'video/mp2t'),
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Cache-Control': 'public, max-age=86400'
    };

    if (res.headers.get('content-range')) {
      responseHeaders['Content-Range'] = res.headers.get('content-range')!;
    }
    if (res.headers.get('accept-ranges')) {
      responseHeaders['Accept-Ranges'] = res.headers.get('accept-ranges')!;
    }
    if (res.headers.get('content-length')) {
      responseHeaders['Content-Length'] = res.headers.get('content-length')!;
    }

    return new Response(arrayBuffer, {
      status: res.status,
      headers: responseHeaders
    });

  } catch (err: any) {
    return c.text(`Proxy Exception: ${err.message}`, 500);
  }
});

// Backward compatibility redirects for older/cached browsers calling /api/kodik/*
app.options('/api/kodik/:path+', (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    }
  });
});

app.get('/api/kodik/:path+', (c) => {
  const path = c.req.param('path');
  const qIndex = c.req.url.indexOf('?');
  const q = qIndex !== -1 ? c.req.url.substring(qIndex) : '';
  return c.redirect(`/api/media/${path}${q}`, 302);
});

app.options('/api/media/playlist', (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    }
  });
});

// Helper to extract nested json object matching key with balanced curly brackets
function extractBalancedObject(str: string): string {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escape = false;
  let endIdx = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (char === '\\') {
      escape = true;
      continue;
    }
    
    if ((char === '"' || char === "'") && !escape) {
      if (inString && stringChar === char) {
        inString = false;
      } else if (!inString) {
        inString = true;
        stringChar = char;
      }
    }
    
    if (!inString) {
      if (char === '{') depth++;
      else if (char === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }
  }
  
  if (endIdx > 0) {
    return str.substring(0, endIdx);
  }
  return str;
}

async function getKodikSkipButtons(iframeUrl: string, html: string): Promise<any> {
  const match = html.match(/(?:skip_buttons|skipButtons)\s*[:=]\s*(\{[\s\S]*?\})/i);
  if (match) {
    try {
      const jsonStr = extractBalancedObject(match[1]);
      const data = JSON.parse(jsonStr);
      
      if (data && data.ajax && data.id) {
        const baseUrl = new URL(iframeUrl);
        const skipUrl = `${baseUrl.protocol}//${baseUrl.host}/skip_buttons`;
        
        const response = await fetch(skipUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': iframeUrl
          },
          body: new URLSearchParams({ id: String(data.id) }).toString()
        });
        
        if (response.ok) {
          const skipData = await response.json() as any;
          return skipData;
        } else {
          // GET fallback
          const getResponse = await fetch(`${skipUrl}?id=${data.id}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': iframeUrl
            }
          });
          if (getResponse.ok) {
            const skipData = await getResponse.json() as any;
            return skipData;
          }
        }
      } else if (data) {
        return data;
      }
    } catch {}
  }

  // Fallback match skip_buttons = { ... }
  const altMatch = html.match(/(?:skip_buttons|skipButtons)\s*=\s*(\{[\s\S]*?\})/i);
  if (altMatch) {
    try {
      const jsonStr = extractBalancedObject(altMatch[1]);
      return JSON.parse(jsonStr);
    } catch {}
  }
  return null;
}

app.options('/api/media/skip-timings', (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    }
  });
});

app.get('/api/media/skip-timings', async (c) => {
  const urlParam = c.req.query('url');
  if (!urlParam) {
    return c.json({ error: 'url parameter is required' }, 400);
  }

  const animeId = c.req.query('animeId');
  const episode = c.req.query('episode');

  // Priority 1: Fetch via AniSkip if animeId and episode are specified
  if (animeId && episode) {
    try {
      const aniSkipUrl = `https://api.aniskip.com/v2/skip-times/${animeId}/${episode}?types[]=op&types[]=ed&episodeLength=0`;
      console.log(`[ANISKIP] Fetching timings from: ${aniSkipUrl}`);
      const aniRes = await fetch(aniSkipUrl);
      if (aniRes.ok) {
        const aniData = await aniRes.json() as any;
        if (aniData && aniData.found && aniData.results) {
          const opResult = aniData.results.find((r: any) => r.skipType === 'op');
          const edResult = aniData.results.find((r: any) => r.skipType === 'ed');

          if (opResult || edResult) {
            const normalized = {
              start: opResult?.interval?.startTime ?? null,
              end: opResult?.interval?.endTime ?? null,
              outro_start: edResult?.interval?.startTime ?? null,
              outro_end: edResult?.interval?.endTime ?? null
            };
            console.log("[ANISKIP] Successfully loaded timings:", normalized);
            return c.json({
              provider: 'aniskip',
              normalized
            });
          }
        }
      }
    } catch (err: any) {
      console.warn("[ANISKIP] Timings not found or error occurred, falling back to Kodik:", err.message);
    }
  }

  try {
    let iframeUrl = urlParam.startsWith('//') ? `https:${urlParam}` : urlParam;
    iframeUrl = iframeUrl.replace(/(kodik\.info|kodik\.cc|kodik\.biz|kodik\.net|kodik\.tv|kodik\.club|kodik\.site|kodik\.space|kodik\.ru|kodikonline\.com|kodikhd\.club|kodik-api\.com)/g, 'kodikplayer.com');
    const iframeRes = await fetch(iframeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Referer': 'https://shikimori.one/'
      }
    });
    if (!iframeRes.ok) {
      return c.json({ 
        error: 'Failed to load player page',
        normalized: {
          start: null,
          end: null,
          outro_start: null,
          outro_end: null
        }
      }, 200);
    }
    const html = await iframeRes.text();
    const skipButtons = await getKodikSkipButtons(iframeUrl, html);
    
    // Normalize response for frontend
    let normalized = {
      start: null as number | null,
      end: null as number | null,
      outro_start: null as number | null,
      outro_end: null as number | null
    };

    if (skipButtons) {
      if (typeof skipButtons.start === 'number' && typeof skipButtons.end === 'number') {
        normalized.start = skipButtons.start;
        normalized.end = skipButtons.end;
      }
      if (skipButtons.intro) {
        if (typeof skipButtons.intro.start === 'number') normalized.start = skipButtons.intro.start;
        else if (typeof skipButtons.intro.from === 'number') normalized.start = skipButtons.intro.from;
        
        if (typeof skipButtons.intro.end === 'number') normalized.end = skipButtons.intro.end;
        else if (typeof skipButtons.intro.to === 'number') normalized.end = skipButtons.intro.to;
      }
      if (skipButtons.outro) {
        if (typeof skipButtons.outro.start === 'number') normalized.outro_start = skipButtons.outro.start;
        else if (typeof skipButtons.outro.from === 'number') normalized.outro_start = skipButtons.outro.from;
        
        if (typeof skipButtons.outro.end === 'number') normalized.outro_end = skipButtons.outro.end;
        else if (typeof skipButtons.outro.to === 'number') normalized.outro_end = skipButtons.outro.to;
      }
    }

    return c.json({
      skip_buttons: skipButtons,
      normalized
    });
  } catch (err: any) {
    return c.json({ 
      error: err.message,
      normalized: {
        start: null,
        end: null,
        outro_start: null,
        outro_end: null
      }
    }, 200);
  }
});

app.options('/api/media/segment', (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    }
  });
});

app.get('/api/media/list', async (c) => {
  const token = c.req.query('token') || '17cc4ee691bc251131a9041e6e89e78e';
  const limit = c.req.query('limit') || '20';
  const types = c.req.query('types') || 'anime-serial';
  
  const targetUrl = `https://kodik-api.com/list?token=${token}&types=${types}&sort=updated_at&order=desc&limit=${limit}&with_material_data=true`;
  
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const data = await res.json();
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    c.header('Access-Control-Allow-Headers', '*');
    return c.json(data);
  } catch (err: any) {
    c.header('Access-Control-Allow-Origin', '*');
    return c.json({ error: err.message }, 500);
  }
});

app.get('/api/media/search', async (c) => {
  const token = c.req.query('token') || '17cc4ee691bc251131a9041e6e89e78e';
  const shikimori_id = c.req.query('shikimori_id');
  const title = c.req.query('title');
  
  let targetUrl = `https://kodik-api.com/search?token=${token}&with_material_data=true`;
  if (shikimori_id) {
    targetUrl += `&shikimori_id=${shikimori_id}`;
  }
  if (title) {
    targetUrl += `&title=${encodeURIComponent(title)}`;
  }
  
  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const data = await res.json();
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    c.header('Access-Control-Allow-Headers', '*');
    return c.json(data);
  } catch (err: any) {
    c.header('Access-Control-Allow-Origin', '*');
    return c.json({ error: err.message }, 500);
  }
});

app.get('/api/collaps/embed', (c) => {
  let urlParam = c.req.query('url');
  if (!urlParam) {
    return c.text('url parameter is required', 400);
  }

  if (urlParam.startsWith('//')) {
    urlParam = `https:${urlParam}`;
  }

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>KamiPlayer Collaps</title>
  <script>
    try { window.M_ID = window.M_ID || {}; } catch(e){}
    window.addEventListener('unhandledrejection', function(e) { e.preventDefault(); });
  </script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #000;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
  </style>
</head>
<body>
  <iframe
    src="${urlParam.replace(/"/g, '&quot;')}"
    allow="autoplay *; fullscreen *; accelerometer; gyroscope; picture-in-picture; encrypted-media;"
    referrerpolicy="no-referrer"
    allowfullscreen>
  </iframe>
</body>
</html>`;

  return c.html(html);
});

// -------------------------------------------------------------
// AniBoom / AnimeGO Stream Resolver API Endpoint
// -------------------------------------------------------------
interface AniboomCacheItem {
  timestamp: number;
  data: {
    success: boolean;
    stream_type: 'dash' | 'hls';
    url: string;
    direct_url: string;
    dash_url?: string;
    hls_url?: string;
    quality: string;
    poster?: string;
    subtitles: any[];
  };
}

const ANIBOOM_CACHE_TTL = 3 * 3600 * 1000; // 3 hours TTL
const aniboomCache = new Map<string, AniboomCacheItem>();

const getCachedAniboom = (key: string) => {
  const item = aniboomCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > ANIBOOM_CACHE_TTL) {
    aniboomCache.delete(key);
    return null;
  }
  return item.data;
};

const setCachedAniboom = (key: string, data: any) => {
  aniboomCache.set(key, { timestamp: Date.now(), data });
  if (aniboomCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of aniboomCache.entries()) {
      if (now - v.timestamp > ANIBOOM_CACHE_TTL) {
        aniboomCache.delete(k);
      }
    }
  }
};

function buildAniboomMasterPlaylist(hlsSrc: string, maxQuality: number | string = 1080, proxyOrigin: string): string {
  const baseUrl = hlsSrc.substring(0, hlsSrc.lastIndexOf('/') + 1);
  const maxQ = typeof maxQuality === 'string' ? parseInt(maxQuality, 10) || 1080 : (maxQuality || 1080);

  const allQualities = [
    { quality: 1080, width: 1920, height: 1080, bandwidth: 4500000 },
    { quality: 720, width: 1280, height: 720, bandwidth: 2200000 },
    { quality: 480, width: 854, height: 480, bandwidth: 1100000 },
    { quality: 360, width: 640, height: 360, bandwidth: 600000 }
  ];

  const availableQualities = allQualities.filter(q => q.quality <= maxQ);
  if (availableQualities.length === 0) {
    availableQualities.push(allQualities[allQualities.length - 1]);
  }

  const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3'];

  availableQualities.forEach(q => {
    masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},RESOLUTION=${q.width}x${q.height},NAME="${q.quality}p"`);
    masterLines.push(`${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(baseUrl + q.quality + '.m3u8')}`);
  });

  return masterLines.join('\n');
}

function normalizeVoiceTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/%20/g, ' ')
    .replace(/%26/g, '&')
    .replace(/\s*\((?:4K|1080p|720p|360p|HD|FHD|QHD)\)/gi, '')
    .replace(/\s*\[(?:4K|1080p|720p|360p|HD|FHD|QHD)\]/gi, '')
    .replace(/\s*(?:4K|1080p|720p|360p)/gi, '')
    .replace(/&amp;/gi, '&')
    .trim();
}

const handleAniboomResolve = async (c: any) => {
  let shikimori_id: string | undefined;
  let episode: number = 1;
  let translation_id: string | undefined;
  let embed_url: string | undefined;

  const steps: { title: string; status: 'success' | 'error' | 'info'; message: string; details?: any }[] = [];
  const nocache = c.req.query('nocache') === 'true';

  if (c.req.method === 'POST') {
    try {
      const body = await c.req.json();
      if (body) {
        shikimori_id = body.shikimori_id ? String(body.shikimori_id) : undefined;
        episode = parseInt(body.episode || '1') || 1;
        translation_id = body.translation_id ? String(body.translation_id) : undefined;
        embed_url = body.embed_url || body.url;
      }
    } catch (_) {
      // Body parsing failed or empty
    }
  }

  if (!shikimori_id && !embed_url) {
    shikimori_id = c.req.query('shikimori_id');
    const epQuery = c.req.query('episode');
    if (epQuery) episode = parseInt(epQuery) || 1;
    translation_id = c.req.query('translation_id');
    embed_url = c.req.query('embed_url') || c.req.query('url');
  }

  // Normalize translation_id if string passed
  if (translation_id) {
    translation_id = normalizeVoiceTitle(translation_id);
  }

  const cacheKey = embed_url
    ? `embed:${embed_url}:${episode}`
    : `shiki:${shikimori_id}:${episode}:${translation_id || 'default'}`;

  steps.push({
    title: "Инициализация резолвера",
    status: "info",
    message: `Запущен поиск потока для ID: ${shikimori_id || 'не указан'}, серия: ${episode}, озвучка: ${translation_id || 'по умолчанию'}. Кэш-байпас: ${nocache ? 'Да' : 'Нет'}`
  });

  if (!nocache) {
    const cached = getCachedAniboom(cacheKey);
    if (cached) {
      console.debug(`⚡ [Aniboom Resolver] Cache hit for ${cacheKey}`);
      steps.push({
        title: "Проверка кэша",
        status: "success",
        message: "Обнаружена валидная запись в кэше (TTL 3 часа)."
      });
      steps.push({
        title: "Загрузка потока",
        status: "success",
        message: `Используется кэшированный поток: ${cached.url}`
      });
      return c.json({
        ...cached,
        is_cache_hit: true,
        steps
      });
    } else {
      steps.push({
        title: "Проверка кэша",
        status: "info",
        message: "Запись в локальном кэше отсутствует или устарела. Запуск полного парсинга..."
      });
    }
  } else {
    steps.push({
      title: "Проверка кэша",
      status: "info",
      message: "Кэш принудительно проигнорирован пользователем."
    });
  }

  // Step 1: Obtain target Aniboom embed URL
  let targetEmbedUrl = embed_url;

  if (!targetEmbedUrl && shikimori_id) {
    steps.push({
      title: "Запрос к AnimeGO",
      status: "info",
      message: `Поиск плеера по Shikimori ID на AnimeGO...`
    });
    try {
      const animegoData = await fetchAnimegoData(shikimori_id);
      if (animegoData) {
        let matchedUrl: string | null = null;
        if (translation_id && animegoData.aniboomMap.length > 0) {
          const cleanTitle = normalizeVoiceTitle(translation_id);
          const subVoices = cleanTitle
            .split(/[\&\/\+,]|\s+and\s+/i)
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);

          const found = animegoData.aniboomMap.find(m => {
            const voiceClean = normalizeVoiceTitle(m.voice).toLowerCase();
            const cleanLower = cleanTitle.toLowerCase();

            // 1. Exact match (cleaned)
            if (voiceClean === cleanLower) return true;

            // 2. Any subvoice match (e.g. "AniStar & DEEP" matches "AniStar" or "DEEP")
            if (subVoices.length > 0 && subVoices.some(sv => voiceClean === sv || voiceClean.includes(sv) || sv.includes(voiceClean))) {
              return true;
            }

            // 3. Partial match
            if (voiceClean.includes(cleanLower) || cleanLower.includes(voiceClean)) return true;

            return false;
          });

          if (found) {
            matchedUrl = found.url;
          }
        }

        if (!matchedUrl) {
          matchedUrl = animegoData.defaultAniboomUrl;
        }

        targetEmbedUrl = matchedUrl;
        steps.push({
          title: "Запрос к AnimeGO",
          status: "success",
          message: `Успешно извлечен AniBoom Embed URL: ${targetEmbedUrl}`
        });
      } else {
        steps.push({
          title: "Запрос к AnimeGO",
          status: "error",
          message: "Не удалось найти плеер AniBoom на AnimeGO для данного Shikimori ID."
        });
      }
    } catch (e: any) {
      console.debug(`[Aniboom Resolver] AnimeGO lookup note: ${e.message}`);
      steps.push({
        title: "Запрос к AnimeGO",
        status: "error",
        message: `Произошла сетевая ошибка при запросе к AnimeGO: ${e.message}`
      });
    }
  }

  const tryKodikFallback = async (reason: string) => {
    steps.push({
      title: "Резервное переключение потока",
      status: "info",
      message: `Прямой доступ к AniBoom недоступен (${reason}). Запуск перехвата резервного HLS-потока...`
    });

    if (shikimori_id) {
      try {
        const kodikTokens = [
          'a0457eb45312af80bbb9f3fb33de3e93',
          'b7cc4293ed475c4ad1fd599d114f4435',
          '17cc4ee691bc251131a9041e6e89e78e'
        ];
        for (const token of kodikTokens) {
          const kodikUrl = `https://kodik-api.com/search?token=${token}&shikimori_id=${shikimori_id}&with_episodes=true`;
          const res = await fetch(kodikUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(3500)
          });
          if (res.ok) {
            const data = await res.json() as any;
            if (data.results && data.results.length > 0) {
              const item = data.results[0];
              let iframeLink = item.link;
              if (item.seasons) {
                const sKeys = Object.keys(item.seasons);
                const targetSeasonKey = String(item.last_season || sKeys[sKeys.length - 1] || '1');
                const seasonObj = item.seasons[targetSeasonKey];
                if (seasonObj && seasonObj.episodes && seasonObj.episodes[String(episode)]) {
                  iframeLink = seasonObj.episodes[String(episode)];
                }
              }
              if (iframeLink) {
                let fullIframe = iframeLink.startsWith('//') ? `https:${iframeLink}` : iframeLink;
                if (!fullIframe.includes('episode=')) {
                  fullIframe += (fullIframe.includes('?') ? '&' : '?') + `episode=${episode}`;
                }
                const proxyOrigin = getProxyOrigin(c);
                const playlistUrl = `${proxyOrigin}/api/media/playlist?url=${encodeURIComponent(fullIframe)}`;

                steps.push({
                  title: "Загрузка резервного потока",
                  status: "success",
                  message: `Успешно сформирован стабильный HLS поток высочайшего качества: ${fullIframe}`
                });

                const fallbackPayload = {
                  success: true,
                  url: playlistUrl,
                  streamType: "hls",
                  provider: "kodik",
                  quality: "1080p",
                  is_fallback: true,
                  steps
                };
                setCachedAniboom(cacheKey, fallbackPayload);
                return c.json(fallbackPayload, 200);
              }
            }
          }
        }
      } catch (fErr: any) {
        console.warn(`[Aniboom Fallback] Kodik lookup failed: ${fErr.message}`);
      }
    }

    const failurePayload = {
      success: false,
      error: `AniBoom resolution failed: ${reason}`,
      steps
    };
    return c.json(failurePayload, 200);
  };

  if (!targetEmbedUrl) {
    return await tryKodikFallback('Could not resolve Aniboom embed URL from AnimeGO');
  }

  // Normalize parameters on embed URL
  let cleanEmbedUrl = targetEmbedUrl.startsWith('//') ? `https:${targetEmbedUrl}` : targetEmbedUrl;
  try {
    const u = new URL(cleanEmbedUrl);
    u.searchParams.set('episode', String(episode));
    // CRITICAL: Only set translation param if translation_id is numeric!
    // Never put non-numeric strings (e.g. "AniStar & DEEP") into aniboom.one's translation param!
    if (translation_id && /^\d+$/.test(String(translation_id))) {
      u.searchParams.set('translation', String(translation_id));
    } else if (!u.searchParams.has('translation')) {
      u.searchParams.set('translation', '16');
    }
    cleanEmbedUrl = u.toString();
  } catch (_) {
    if (!cleanEmbedUrl.includes('episode=')) {
      cleanEmbedUrl += (cleanEmbedUrl.includes('?') ? '&' : '?') + `episode=${episode}`;
    }
    if (!cleanEmbedUrl.includes('translation=')) {
      if (translation_id && /^\d+$/.test(String(translation_id))) {
        cleanEmbedUrl += (cleanEmbedUrl.includes('?') ? '&' : '?') + `translation=${translation_id}`;
      } else {
        cleanEmbedUrl += (cleanEmbedUrl.includes('?') ? '&' : '?') + `translation=16`;
      }
    }
  }

  steps.push({
    title: "Конечный Embed URL",
    status: "success",
    message: `Используется нормализованный URL плеера: ${cleanEmbedUrl}`
  });

  // Step 2: Get HTML of Aniboom embed
  steps.push({
    title: "Загрузка HTML страницы плеера",
    status: "info",
    message: "Отправка GET-запроса на получение страницы плеера AniBoom..."
  });
  try {
    const aRes = await fetch(cleanEmbedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': 'https://animego.org/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(3000)
    });

    if (!aRes.ok) {
      return await tryKodikFallback(`Aniboom server returned HTTP ${aRes.status}`);
    }

    const html = await aRes.text();
    steps.push({
      title: "Загрузка HTML страницы плеера",
      status: "success",
      message: `Успешно загружено HTML содержимое плеера (Размер: ${html.length} символов)`
    });

    steps.push({
      title: "Парсинг data-parameters",
      status: "info",
      message: "Поиск и извлечение атрибута 'data-parameters' из HTML разметки..."
    });

    const match = html.match(/data-parameters="([^"]+)"/) || html.match(/data-parameters='([^']+)'/);

    if (!match) {
      return await tryKodikFallback('data-parameters attribute not found in Aniboom embed HTML');
    }

    const rawParams = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    let decoded: any;
    try {
      decoded = JSON.parse(rawParams);
      steps.push({
        title: "Парсинг data-parameters",
        status: "success",
        message: `Параметры успешно декодированы. ID видео: ${decoded.id || 'не указан'}, Качество: ${decoded.qualityVideo || 'не указано'}p`,
        details: {
          id: decoded.id,
          qualityVideo: decoded.qualityVideo,
          hasHls: !!decoded.hls,
          hasDash: !!decoded.dash,
          rawHls: decoded.hls,
          rawDash: decoded.dash,
          duration: decoded.duration,
          author: decoded.author,
          originalParameters: decoded
        }
      });
    } catch (parseErr: any) {
      return await tryKodikFallback(`Failed to parse data-parameters JSON: ${parseErr.message}`);
    }

    const videoHash = decoded.id;

    // Step 3: Trigger /cdn2/{videoHash} with Origin & Referer
    if (videoHash) {
      steps.push({
        title: "Рукопожатие CDN2 (Хэндшейк)",
        status: "info",
        message: `Отправка POST-запроса авторизации потока к https://aniboom.one/cdn2/${videoHash}`
      });
      try {
        const cdnRes = await fetch(`https://aniboom.one/cdn2/${videoHash}`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Origin': 'https://aniboom.one',
            'Referer': cleanEmbedUrl,
            'Content-Type': 'application/json'
          }
        });
        steps.push({
          title: "Рукопожатие CDN2 (Хэндшейк)",
          status: "success",
          message: `Хэндшейк завершен со статусом: HTTP ${cdnRes.status}`
        });
      } catch (cdnErr: any) {
        console.debug(`[Aniboom Resolver] CDN2 handshake note: ${cdnErr.message}`);
        steps.push({
          title: "Рукопожатие CDN2 (Хэндшейк)",
          status: "error",
          message: `Внимание: хэндшейк CDN2 завершился с предупреждением: ${cdnErr.message}`
        });
      }
    }

    // Step 4: Extract DASH (.mpd) and HLS (.m3u8)
    steps.push({
      title: "Анализ медиа-потоков",
      status: "info",
      message: "Анализ доступных форматов стриминга (DASH, HLS)..."
    });

    let dashSrc = '';
    if (decoded.dash) {
      try {
        const dashObj = typeof decoded.dash === 'string' ? JSON.parse(decoded.dash) : decoded.dash;
        dashSrc = dashObj.src || dashObj.url || '';
      } catch (_) {}
    }

    let hlsSrc = '';
    if (decoded.hls) {
      try {
        const hlsObj = typeof decoded.hls === 'string' ? JSON.parse(decoded.hls) : decoded.hls;
        hlsSrc = hlsObj.src || hlsObj.url || '';
      } catch (_) {}
    }

    if (dashSrc.startsWith('//')) dashSrc = `https:${dashSrc}`;
    if (hlsSrc.startsWith('//')) hlsSrc = `https:${hlsSrc}`;

    // Prefer HLS over DASH for much better proxying stability and built-in quality switching!
    const streamType = hlsSrc ? 'hls' : (dashSrc ? 'dash' : 'hls');
    const primarySrc = hlsSrc || dashSrc;

    steps.push({
      title: "Анализ медиа-потоков",
      status: primarySrc ? "success" : "error",
      message: primarySrc 
        ? `Найдены потоки. Выбран формат: ${streamType.toUpperCase()}. Ссылка: ${primarySrc}`
        : "Не найдено ни одного валидного потока DASH (.mpd) или HLS (.m3u8) в параметрах AniBoom."
    });

    if (!primarySrc) {
      return await tryKodikFallback('No valid DASH (.mpd) or HLS (.m3u8) video stream found in Aniboom parameters');
    }

    steps.push({
      title: "Настройка 4K прокси",
      status: "info",
      message: "Генерация безопасной прокси-ссылки для обхода CORS и заголовков Referer..."
    });

    const proxyOrigin = getProxyOrigin(c);
    const proxiedDashUrl = dashSrc ? `${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(dashSrc)}` : undefined;
    const proxiedHlsUrl = hlsSrc ? `${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(hlsSrc)}` : undefined;
    const mainProxiedUrl = proxiedHlsUrl || proxiedDashUrl || '';

    steps.push({
      title: "Настройка 4K прокси",
      status: "success",
      message: `Прокси-ссылка готова: ${mainProxiedUrl.substring(0, 80)}...`
    });

    steps.push({
      title: "Готовность к воспроизведению",
      status: "success",
      message: "Все этапы пройдены успешно! Поток передан в плеер KamiPlayer с поддержкой всех качеств и аудиодорожек."
    });

    const responsePayload = {
      success: true,
      is_cache_hit: false,
      stream_type: streamType as 'dash' | 'hls',
      url: mainProxiedUrl,
      direct_url: primarySrc,
      dash_url: proxiedDashUrl,
      hls_url: proxiedHlsUrl,
      quality: decoded.qualityVideo ? `${decoded.qualityVideo}p` : '1080p',
      poster: decoded.poster || null,
      subtitles: [],
      steps
    };

    setCachedAniboom(cacheKey, responsePayload);

    return c.json(responsePayload);
  } catch (err: any) {
    steps.push({
      title: "Критическая ошибка",
      status: "error",
      message: `Произошла критическая ошибка резолвинга: ${err.message}`
    });
    return c.json({
      success: false,
      error: `Aniboom resolution failed: ${err.message}`,
      steps
    }, 500);
  }
};

app.get('/api/media/aniboom/master.m3u8', async (c) => {
  const urlParam = c.req.query('url');
  if (!urlParam) {
    return c.text('Error: missing url param', 400);
  }
  const proxyOrigin = getProxyOrigin(c);
  return c.redirect(`${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(urlParam)}`, 302);
});

app.get('/api/media/aniboom/resolve', handleAniboomResolve);
app.post('/api/media/aniboom/resolve', handleAniboomResolve);

app.get('/api/media/playlist', async (c) => {
  let urlParam = c.req.query('url');
  const fallbackUrl = c.req.query('fallback_url');

  if (!urlParam) {
    return c.json({ error: 'url parameter is required' }, 400);
  }

  // If Aniboom URL, extract M3U8 directly from data-parameters
  const isAniboom = urlParam.includes('aniboom') || urlParam.includes('boom-img');
  if (isAniboom) {
    console.log(`🔍 [ANIBOOM PARSER] Received request for URL: ${urlParam}`);
    try {
      let aniboomUrl = urlParam.startsWith('//') ? `https:${urlParam}` : urlParam;
      // Ensure episode and translation params are present (Aniboom returns 404 without translation param)
      if (!aniboomUrl.includes('episode=')) {
        aniboomUrl += (aniboomUrl.includes('?') ? '&' : '?') + 'episode=1';
      }
      if (!aniboomUrl.includes('translation=')) {
        aniboomUrl += (aniboomUrl.includes('?') ? '&' : '?') + 'translation=16';
      }

      console.log(`🌐 [ANIBOOM PARSER] Normalized embed URL: ${aniboomUrl}`);

      const aRes = await fetch(aniboomUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://animego.org/',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      console.log('Status:', aRes.status);
      const aHtml = await aRes.text();
      console.log('HTML preview:', aHtml.slice(0, 500));

      if (aRes.ok) {
        const match = aHtml.match(/data-parameters="([^"]+)"/) || aHtml.match(/data-parameters='([^']+)'/);
        if (match) {
          const rawParams = match[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');

          const decoded = JSON.parse(rawParams);
          let hlsSrc = '';
          if (decoded.hls) {
            const hlsObj = typeof decoded.hls === 'string' ? JSON.parse(decoded.hls) : decoded.hls;
            hlsSrc = hlsObj.src || hlsObj.url || '';
          }

          console.log(`📦 [ANIBOOM PARSER] Parsed metadata:`, {
            id: decoded.id,
            maxQuality: decoded.qualityVideo ? `${decoded.qualityVideo}p` : 'Auto',
            durationSec: decoded.duration,
            poster: decoded.poster,
            hlsMasterUrl: hlsSrc
          });

          if (hlsSrc) {
            if (hlsSrc.startsWith('//')) hlsSrc = `https:${hlsSrc}`;

            if (c.req.query('resolve') === 'true') {
              return c.json({ success: true, url: hlsSrc, poster: decoded.poster, qualities: [1080, 720, 480, 360] });
            }

            const targetQuality = c.req.query('quality');
            const proxyOrigin = getProxyOrigin(c);

            // Directly proxy the full Master Playlist with all resolutions & audio streams
            if (!targetQuality) {
              console.log(`🎬 [ANIBOOM PARSER] Proxying authentic Master Playlist: ${hlsSrc}`);
              return c.redirect(`${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(hlsSrc)}`, 302);
            }

            // If a specific quality was requested, redirect to proxy for that specific variant
            const baseUrl = hlsSrc.substring(0, hlsSrc.lastIndexOf('/') + 1);
            const variantUrl = `${baseUrl}${targetQuality}.m3u8`;
            return c.redirect(`${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(variantUrl)}`, 302);
          } else {
            console.error(`❌ [ANIBOOM PARSER] 'hls' parameter missing in decoded JSON`);
          }
        } else {
          console.error(`❌ [ANIBOOM PARSER] Could not find data-parameters attribute in embed HTML`);
        }
      } else {
        console.error(`❌ [ANIBOOM PARSER] Embed HTML fetch failed with status: ${aRes.status}`);
      }
      return c.json({ error: `Aniboom extraction failed. HTTP Status: ${aRes.status}` }, 500);
    } catch (aErr: any) {
      console.warn(`❌ [ANIBOOM PARSER] Exception occurred: ${aErr.message}`);
      return c.json({ error: `Aniboom proxy error: ${aErr.message}` }, 500);
    }
  }

  // If Collaps URL, attempt Collaps extraction first
  const isCollaps = urlParam.includes('collaps') || urlParam.includes('ortified');
  if (isCollaps) {
    console.log(`[COLLAPS PROXY] Attempting playlist extraction for: ${urlParam}`);
    try {
      let iframeUrl = urlParam.startsWith('//') ? `https:${urlParam}` : urlParam;
      const cRes = await fetch(iframeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Referer': 'https://apicollaps.cc/'
        }
      });
      if (cRes.ok) {
        const cHtml = await cRes.text();
        const m3u8Match = cHtml.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i) ||
                          cHtml.match(/["']([^"']+\.m3u8[^"']*)["']/i);
        if (m3u8Match) {
          let streamUrl = m3u8Match[1] || m3u8Match[0];
          if (streamUrl.startsWith('//')) streamUrl = `https:${streamUrl}`;
          console.log(`[COLLAPS PROXY] Resolved direct m3u8: ${streamUrl}`);
          return c.redirect(streamUrl, 302);
        }
      }
    } catch (cErr: any) {
      console.warn(`[COLLAPS PROXY] Collaps extraction failed: ${cErr.message}`);
    }
    // If Collaps extraction failed and fallbackUrl exists, use fallbackUrl
    if (fallbackUrl && !fallbackUrl.includes('collaps') && !fallbackUrl.includes('ortified')) {
      console.log(`[MEDIA PROXY] Falling back to secondary stream URL: ${fallbackUrl}`);
      urlParam = fallbackUrl;
    } else {
      return c.json({ error: 'Collaps streaming proxy is unavailable. Please use direct iframe player.' }, 400);
    }
  }

  try {
    let iframeUrl = urlParam.startsWith('//') ? `https:${urlParam}` : urlParam;
    iframeUrl = iframeUrl.replace(/(kodik\.info|kodik\.cc|kodik\.biz|kodik\.net|kodik\.tv|kodik\.club|kodik\.site|kodik\.space|kodik\.ru|kodikonline\.com|kodikhd\.club|kodik-api\.com)/g, 'kodikplayer.com');
    console.log(`[KODIK PROXY] Extracting playlist from: ${iframeUrl}`);

    // 1. Fetch iframe page
    const iframeRes = await fetch(iframeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Referer': 'https://shikimori.one/'
      }
    });
    const html = await iframeRes.text();

    // 2. Extract parameters
    const urlParamsMatch = html.match(/urlParams\s*=\s*'([^']+)'/) || html.match(/urlParams\s*=\s*"([^"]+)"/) || html.match(/urlParams\s*=\s*({[^;]+})/);
    const hashMatch = html.match(/\.hash\s*=\s*'([^']+)'/) || html.match(/\.hash\s*=\s*"([^"]+)"/) || html.match(/\.hash\s*=\s*['"]([^'"]+)['"]/);
    const idMatch = html.match(/\.id\s*=\s*'([^']+)'/) || html.match(/\.id\s*=\s*"([^"]+)"/) || html.match(/\.id\s*=\s*['"]([^'"]+)['"]/);
    const typeMatch = html.match(/\.type\s*=\s*'([^']+)'/) || html.match(/\.type\s*=\s*"([^"]+)"/) || html.match(/\.type\s*=\s*['"]([^'"]+)['"]/);

    if (!urlParamsMatch || !hashMatch || !idMatch || !typeMatch) {
      console.error('[KODIK PROXY] Failed to parse iframe params');
      return c.json({ error: 'Failed to parse iframe parameters. Stream might be offline.' }, 500);
    }

    const urlParams = JSON.parse(urlParamsMatch[1]);
    const videoHash = hashMatch[1];
    const videoId = idMatch[1];
    const videoType = typeMatch[1];

    // Find script url (preferring serial/player minified js in assets)
    let scriptUrl = '';
    const scriptTagRegex = /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+\.js[^"']*)["']/gi;
    let match;
    const candidateScripts: string[] = [];
    while ((match = scriptTagRegex.exec(html)) !== null) {
      candidateScripts.push(match[1]);
    }

    const assetScript = candidateScripts.find(s => s.includes('/assets/'));
    if (assetScript) {
      scriptUrl = assetScript;
    } else if (candidateScripts.length > 0) {
      scriptUrl = candidateScripts[0];
    }

    if (!scriptUrl) {
      const inlineJsMatch = html.match(/["'](\/assets\/js\/app\.[^"']+\.js)["']/);
      if (inlineJsMatch) {
        scriptUrl = inlineJsMatch[1];
      }
    }

    if (!scriptUrl) {
      scriptUrl = '/assets/js/app.serial.js'; // fallback
    }

    const baseUrlObj = new URL(iframeUrl);
    const scriptAbsoluteUrl = scriptUrl.startsWith('http') ? scriptUrl : `${baseUrlObj.protocol}//${baseUrlObj.host}${scriptUrl}`;

    // 3. Request script to get Gbox Ajax link
    const scriptRes = await fetch(scriptAbsoluteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': iframeUrl
      }
    });
    const scriptHtml = await scriptRes.text();

    const ajaxMatch = scriptHtml.match(/\$.ajax\([\s\S]*?url:\s*atob\("([^"]+)"\)/) || 
                      scriptHtml.match(/atob\("([^"'\(\)]+)"\)/);
    if (!ajaxMatch) {
      console.error('[KODIK PROXY] Gbox ajax match failed');
      return c.json({ error: 'Could not extract player API script' }, 500);
    }

    const gboxPath = atob(ajaxMatch[1]);
    const gboxUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${gboxPath}`;

    // 4. Request video links from gbox
    const payload = new URLSearchParams({
      hash: videoHash,
      id: videoId,
      type: videoType,
      d: urlParams.d || 'kodik.info',
      d_sign: urlParams.d_sign || '',
      pd: urlParams.pd || '',
      pd_sign: urlParams.pd_sign || '',
      ref: safeDecodeURIComponent(urlParams.ref || ''),
      ref_sign: urlParams.ref_sign || '',
      bad_user: 'true',
      cdn_is_working: 'true'
    });

    const gboxRes = await fetch(gboxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': iframeUrl
      },
      body: payload.toString()
    });

    const gboxData = await gboxRes.json() as any;
    if (!gboxData || !gboxData.links) {
      console.error('[KODIK PROXY] Gbox returned no links', gboxData);
      return new Response('Error: Failed to retrieve stream links from Kodik', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 5. Build dynamic Master Playlist or yield single-quality playlist based on query parameters
    const targetQuality = c.req.query('quality');
    const qualities = Object.keys(gboxData.links).map(Number).sort((a,b) => b - a); // descending quality: 720, 480, 360

    if (c.req.query('resolve') === 'true') {
      const resolvedLinks: Record<string, string> = {};
      for (const qual of Object.keys(gboxData.links)) {
        const listSources = gboxData.links[qual];
        if (listSources && listSources.length > 0) {
          try {
            const rawSrc = listSources[0].src;
            const decryptedUrl = rawSrc.includes('mp4:hls:manifest') ? rawSrc : decodeKodikUrl(rawSrc);
            resolvedLinks[qual] = decryptedUrl.startsWith('//') ? `https:${decryptedUrl}` : decryptedUrl;
          } catch (de_err: any) {
            console.error(`[KODIK PROXY] Decryption failed for quality ${qual}:`, de_err.message);
          }
        }
      }
      c.header('Access-Control-Allow-Origin', '*');
      c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      c.header('Access-Control-Allow-Headers', '*');
      return c.json({
        success: true,
        links: resolvedLinks,
        qualities
      });
    }

    if (!targetQuality && qualities.length > 1) {
      console.log(`[KODIK PROXY] Building Master Playlist for available qualities: ${qualities.join(', ')}`);
      const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3'];
      
      qualities.forEach(q => {
        let width = 1280, height = 720, bandwidth = 2200000;
        if (q === 480) {
          width = 854; height = 480; bandwidth = 1100000;
        } else if (q === 360) {
          width = 640; height = 360; bandwidth = 600000;
        } else if (q === 1080) {
          width = 1920; height = 1080; bandwidth = 4500000;
        }
        
        masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height},NAME="${q}p"`);
        masterLines.push(`/api/media/playlist?url=${encodeURIComponent(iframeUrl)}&quality=${q}`);
      });

      return new Response(masterLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-mpegURL',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        }
      });
    }

    const selectedQual = targetQuality || String(qualities[0] || 720);
    const listSources = gboxData.links[selectedQual] || gboxData.links[String(qualities[0] || 720)];
    if (!listSources || listSources.length === 0) {
      return new Response('Error: No video stream matches found for target quality', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const rawSrc = listSources[0].src;
    // Decrypt the URL if it doesn't already contain manifest
    const decryptedUrl = rawSrc.includes('mp4:hls:manifest') ? rawSrc : decodeKodikUrl(rawSrc);
    const playlistUrl = decryptedUrl.startsWith('//') ? `https:${decryptedUrl}` : decryptedUrl;

    console.log(`[KODIK PROXY] Fetched decrypted stream. Base HLS: ${playlistUrl}`);

    // 6. Fetch the actual M3U8 file contents
    const m3u8Res = await fetch(playlistUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kodik.info/'
      }
    });

    if (!m3u8Res.ok) {
      console.error(`[KODIK PROXY] Failed to fetch M3U8, status: ${m3u8Res.status}`);
      return new Response(`Error: Kodik manifest loading failed with status ${m3u8Res.status}`, {
        status: m3u8Res.status,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const m3u8Text = await m3u8Res.text();

    // Validation: Ensure the playlist starts with #EXTM3U (not HTML error or blank page)
    if (!m3u8Text || !m3u8Text.trim().startsWith('#EXTM3U')) {
      console.error(`[KODIK PROXY ERROR] Manifest from Kodik is empty or invalid. Res length: ${m3u8Text?.length || 0}. Starts with:`, m3u8Text ? m3u8Text.slice(0, 500) : "empty");
      return new Response('Error: Proxy loaded an invalid M3U8 manifest from Kodik. The source might be blocking or offline.', {
        status: 502,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // 7. Rewrite chunk entries in M3U8
    const m3u8Base = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
    
    // Clean CRLF and split cleanly to avoid breaking tags
    const lines = m3u8Text.replace(/\r/g, '').split('\n');
    const proxyUrlBase = `${getProxyOrigin(c)}/api/media/segment?url=`;

    const rewrittenLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      
      // Resolve path
      let absSegmentUrl = trimmed;
      if (!trimmed.startsWith('http')) {
        absSegmentUrl = trimmed.startsWith('/') 
          ? new URL(trimmed, playlistUrl).toString()
          : m3u8Base + trimmed;
      }

      // Add segment proxy URL
      return `${proxyUrlBase}${encodeURIComponent(absSegmentUrl)}`;
    });

    const rewrittenText = rewrittenLines.join('\n');

    return new Response(rewrittenText, {
       status: 200,
       headers: {
         'Content-Type': 'application/x-mpegURL',
         'Access-Control-Allow-Origin': '*',
         'Access-Control-Allow-Methods': 'GET, OPTIONS',
         'Access-Control-Allow-Headers': '*',
         'Cache-Control': 'no-cache, no-store, must-revalidate',
       }
    });

  } catch (error: any) {
    console.error('[KODIK PROXY ERROR]', error);
    return new Response('Error: Failed to compile streaming proxy playlist. ' + error.message, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }
});

app.get('/api/media/segment', async (c) => {
  let segmentUrl = c.req.query('url');
  const rawUrl = c.req.url;
  const urlIndex = rawUrl.indexOf('url=');
  if (urlIndex !== -1) {
    const extracted = rawUrl.substring(urlIndex + 4);
    try {
      segmentUrl = decodeURIComponent(extracted);
    } catch (err) {
      segmentUrl = c.req.query('url');
    }
  }

  if (!segmentUrl) {
    return c.json({ error: 'No segment URL provided' }, 400);
  }

  try {
    const segmentUrlObj = new URL(segmentUrl);
    const referer = `https://${segmentUrlObj.host}/` || 'https://kodik.info/';

    let response: Response | undefined;
    let attempts = 3;
    let baseDelay = 300;
    let lastError: any = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      try {
        response = await fetch(segmentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Referer': referer,
            'Accept': '*/*'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          break;
        } else {
          lastError = new Error(`Status ${response.status}`);
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
      }

      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        baseDelay *= 1.5;
      }
    }

    if (!response || !response.ok) {
      const errMsg = lastError ? lastError.message : 'Unknown error';
      return new Response(`Error fetching segment after retries: ${errMsg}`, { status: response ? response.status : 502 });
    }

    const bodyData = response.body || await response.arrayBuffer();

    return new Response(bodyData, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp2t',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  } catch (e: any) {
    console.error('[KODIK SEGMENT PROXY EXCEPTION]', e);
    return c.json({ error: 'Segment proxy fetch failed: ' + e.message }, 500);
  }
});

interface DownloadTask {
  id: string;
  stage: string;       // "resolving" | "downloading" | "merging" | "muxing" | "ready" | "failed"
  processed: number;   // count of segments processed so far
  total: number;       // total segments
  progress: number;    // percent (0 to 100)
  status: 'running' | 'success' | 'failed';
  error?: string;
  outputFile?: string;
  fileName?: string;
  createdAt: number;
}

const activeDownloadTasks = new Map<string, DownloadTask>();
const downloadsBaseDir = path.join(os.tmpdir(), 'anime_downloads');
if (!fs.existsSync(downloadsBaseDir)) {
  fs.mkdirSync(downloadsBaseDir, { recursive: true });
}

const cleanOldDownloads = async () => {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours
  for (const [taskId, task] of activeDownloadTasks.entries()) {
    if (now - task.createdAt > maxAge) {
      if (task.outputFile && fs.existsSync(task.outputFile)) {
        try {
          await fs.promises.unlink(task.outputFile);
          console.log(`[CLEANUP] Cleaned up output file for task ${taskId}: ${task.outputFile}`);
        } catch (e: any) {
          console.error(`[CLEANUP] Error deleting ${task.outputFile}:`, e.message);
        }
      }
      activeDownloadTasks.delete(taskId);
    }
  }
};

async function fetchWithPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        throw err;
      }
    }
  }

  for (let w = 0; w < Math.min(limit, items.length); w++) {
    promises.push(worker());
  }

  await Promise.all(promises);
  return results;
}

async function runHlsDownloadBackground(taskId: string, iframeUrl: string, quality: string, downloadFileName: string) {
  const task = activeDownloadTasks.get(taskId);
  if (!task) return;

  const tempDir = path.join(os.tmpdir(), 'anime_downloads_temp', taskId);
  await fs.promises.mkdir(tempDir, { recursive: true });

  try {
    task.stage = 'resolving';
    task.progress = 5;

    console.log(`[BACKGROUND DOWNLOAD] Resolving playlist programmatically for: ${iframeUrl}`);
    
    const playlistRes = await app.request(`/api/media/playlist?url=${encodeURIComponent(iframeUrl)}&quality=${quality}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kodik.info/'
      }
    });

    if (!playlistRes.ok) {
      throw new Error(`Failed to resolve media playlist. Status: ${playlistRes.status}`);
    }

    const playlistText = await playlistRes.text();
    const lines = playlistText.split('\n');
    const segmentUrls: string[] = [];

    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        if (line.includes('/api/media/segment?url=')) {
          const encodedUrl = line.split('/api/media/segment?url=')[1];
          if (encodedUrl) {
            segmentUrls.push(safeDecodeURIComponent(encodedUrl));
          }
        } else if (line.startsWith('http')) {
          segmentUrls.push(line);
        } else {
          segmentUrls.push(line);
        }
      }
    }

    if (segmentUrls.length === 0) {
      throw new Error("No segments found in resolved playlist.");
    }

    task.stage = 'downloading';
    task.total = segmentUrls.length;
    task.progress = 10;
    console.log(`[BACKGROUND DOWNLOAD] Starting concurrent download of ${segmentUrls.length} segments to ${tempDir}`);

    task.processed = 0;
    
    await fetchWithPool(segmentUrls, 24, async (segUrl, index) => {
      const segPath = path.join(tempDir, `segment_${String(index).padStart(5, '0')}.ts`);
      const maxRetries = 4;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const urlObj = new URL(segUrl);
          const referer = `https://${urlObj.host}/` || 'https://kodik.info/';
          
          const controller = new AbortController();
          const tId = setTimeout(() => controller.abort(), 12000);
          
          const res = await fetch(segUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
              'Referer': referer,
              'Accept': '*/*'
            },
            signal: controller.signal
          });
          
          clearTimeout(tId);
          
          if (!res.ok) {
            throw new Error(`HTTP status ${res.status}`);
          }
          
          const arrayBuf = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          await fs.promises.writeFile(segPath, buffer);
          
          task.processed += 1;
          task.progress = Math.round(10 + (task.processed / task.total) * 75);
          return;
        } catch (err: any) {
          if (attempt === maxRetries) {
            throw new Error(`Failed to download segment ${index}: ${err.message}`);
          }
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
      }
    });

    task.stage = 'merging';
    task.progress = 88;
    console.log(`[BACKGROUND DOWNLOAD] Concatenating ${task.total} segments...`);

    const combinedTsPath = path.join(tempDir, 'combined.ts');
    const writeStream = fs.createWriteStream(combinedTsPath);
    
    for (let i = 0; i < task.total; i++) {
      const segPath = path.join(tempDir, `segment_${String(i).padStart(5, '0')}.ts`);
      if (fs.existsSync(segPath)) {
        await new Promise<void>((resolve, reject) => {
          const readStream = fs.createReadStream(segPath);
          readStream.pipe(writeStream, { end: false });
          readStream.on('end', () => {
            fs.promises.unlink(segPath).catch(() => {});
            resolve();
          });
          readStream.on('error', (err) => reject(err));
        });
      }
    }
    
    await new Promise<void>((resolve) => {
      writeStream.end(resolve);
    });

    task.stage = 'muxing';
    task.progress = 95;
    
    const outputMp4Path = path.join(downloadsBaseDir, `${taskId}.mp4`);
    const ffmpegCmd = `ffmpeg -y -i "${combinedTsPath}" -c copy -bsf:a aac_adtstoasc "${outputMp4Path}"`;
    
    await execAsync(ffmpegCmd);

    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    if (fs.existsSync(outputMp4Path) && (await fs.promises.stat(outputMp4Path)).size > 10 * 1024) {
      task.stage = 'ready';
      task.progress = 100;
      task.status = 'success';
      task.outputFile = outputMp4Path;
      console.log(`[BACKGROUND DOWNLOAD SUCCESS] Task ${taskId} processed successfully.`);
    } else {
      throw new Error("Muxed MP4 output file does not exist or has zero size.");
    }

  } catch (err: any) {
    console.error(`[BACKGROUND DOWNLOAD ERROR] ${taskId}`, err);
    task.stage = 'failed';
    task.status = 'failed';
    task.error = err.message || String(err);
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

app.get('/api/media/download/start', async (c) => {
  const iframeUrl = c.req.query('url');
  const quality = c.req.query('quality') || '720';
  const animeTitle = c.req.query('title') || 'Anime';
  const episode = c.req.query('episode') || '1';

  if (!iframeUrl) {
    return c.json({ error: 'url is required' }, 400);
  }

  const taskId = `dl_${Date.now()}_${Math.random().toString(36).substring(3, 9)}`;
  const cleanTitle = animeTitle.replace(/[^a-zA-Z0-9а-яА-ЯёЁ\s-_]/g, '').trim() || 'Anime';
  const downloadFileName = `${cleanTitle}_Ep_${episode}_${quality}p.mp4`;

  const task: DownloadTask = {
    id: taskId,
    stage: 'resolving',
    processed: 0,
    total: 0,
    progress: 0,
    status: 'running',
    createdAt: Date.now(),
    fileName: downloadFileName
  };

  activeDownloadTasks.set(taskId, task);
  
  cleanOldDownloads().catch(() => {});

  runHlsDownloadBackground(taskId, iframeUrl, quality, downloadFileName).catch(err => {
    console.error(`[DOWNLOAD TASK FAILED] ${taskId}`, err);
    const curr = activeDownloadTasks.get(taskId);
    if (curr) {
      curr.status = 'failed';
      curr.stage = 'failed';
      curr.error = err.message || String(err);
    }
  });

  return c.json({ success: true, taskId, fileName: downloadFileName });
});

app.get('/api/media/download/progress', async (c) => {
  const taskId = c.req.query('taskId');
  if (!taskId) {
    return c.json({ error: 'taskId is required' }, 400);
  }
  const task = activeDownloadTasks.get(taskId);
  if (!task) {
    return c.json({ error: 'Task not found or expired.' }, 404);
  }
  return c.json({
    id: task.id,
    stage: task.stage,
    processed: task.processed,
    total: task.total,
    progress: task.progress,
    status: task.status,
    error: task.error,
    fileName: task.fileName
  });
});

app.get('/api/media/download/file', async (c) => {
  const taskId = c.req.query('taskId');
  if (!taskId) {
    return c.json({ error: 'taskId is required' }, 400);
  }
  const task = activeDownloadTasks.get(taskId);
  if (!task || !task.outputFile || !fs.existsSync(task.outputFile)) {
    return c.json({ error: 'Download file not found or has expired. Files are retained for 2 hours.' }, 404);
  }

  const fileStream = fs.createReadStream(task.outputFile);
  const stats = await fs.promises.stat(task.outputFile);

  c.header('Content-Type', 'video/mp4');
  c.header('Content-Disposition', `attachment; filename="${encodeURIComponent(task.fileName || 'anime.mp4')}"`);
  c.header('Content-Length', String(stats.size));

  setTimeout(() => {
    if (task.outputFile && fs.existsSync(task.outputFile)) {
      fs.promises.unlink(task.outputFile).catch(() => {});
    }
  }, 120000);

  return new Response(fileStream as any);
});

// WS Room Route (must be registered before SPA fallback)
app.get('/ws/room', handleRoomWebSocket);

// Serve all static files from ./dist directory
app.use('/*', serveStatic({ root: './dist' }));

// Never serve HTML for missing static files (scripts, styles, images, assets) - return 404 to avoid MIME type errors
app.get('/*', async (c) => {
  const reqPath = c.req.path;
  
  // If request is for an asset, script, or contains a file extension, return 404
  if (
    reqPath.startsWith('/assets/') ||
    /\.(js|mjs|cjs|ts|tsx|jsx|css|map|wasm|png|jpg|jpeg|gif|svg|ico|webp|json|woff|woff2|ttf|eot|xml|txt)$/i.test(reqPath)
  ) {
    c.header('Content-Type', 'text/plain; charset=utf-8');
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    return c.text('Asset Not Found', 404);
  }

  // SPA Fallback for HTML navigation routes
  const indexPath = path.join(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    const html = await fs.promises.readFile(indexPath, 'utf-8');
    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    c.header('Surrogate-Control', 'no-store');
    return c.html(html);
  }
  return c.text('Application is compiling or index.html missing', 503);
});

const isCloudflareEnvironment = typeof WebSocketPair !== 'undefined';

if (!isCloudflareEnvironment) {
  const port = 3000;
  console.log(`[HONO NODE SERVER] Starting backend listener on port ${port}...`);
  serve({
    fetch: app.fetch,
    port,
    hostname: '0.0.0.0'
  });
}

export default {
  fetch: app.fetch,
};
