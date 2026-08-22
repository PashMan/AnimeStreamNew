import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { serve } from '@hono/node-server';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { makeRoomWebSocketHandler } from './utils/socketServer';
import { upgradeWebSocket as nodeUpgradeWebSocket } from '@hono/node-server';
import { upgradeWebSocket as cfUpgradeWebSocket } from 'hono/cloudflare-workers';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveAnimeEpisodeWithD1 } from './server/animeBridge';
import {
  getVote4KState,
  suggestAnimeFor4K,
  upvoteSuggestion,
  voteFinalCandidate
} from './server/vote4k';

const execAsync = promisify(exec);

process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER UNHANDLED REJECTION]:', reason);
});

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

function safeParseParams(rawStr: string): any {
  if (!rawStr) return {};
  const clean = rawStr
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  try {
    return JSON.parse(clean);
  } catch (_) {}

  const result: any = {};
  const hlsMatch = clean.match(/"hls"\s*:\s*(\{[\s\S]*?\}|"[^"]+")/i) || clean.match(/'hls'\s*:\s*(\{[\s\S]*?\}|'[^']+')/i);
  if (hlsMatch) {
    try {
      result.hls = JSON.parse(hlsMatch[1].replace(/\\"/g, '"'));
    } catch (_) {
      result.hls = hlsMatch[1];
    }
  }

  const dashMatch = clean.match(/"dash"\s*:\s*(\{[\s\S]*?\}|"[^"]+")/i) || clean.match(/'dash'\s*:\s*(\{[\s\S]*?\}|'[^']+')/i);
  if (dashMatch) {
    try {
      result.dash = JSON.parse(dashMatch[1].replace(/\\"/g, '"'));
    } catch (_) {
      result.dash = dashMatch[1];
    }
  }

  const idMatch = clean.match(/"id"\s*:\s*"([^"]+)"/i) || clean.match(/"id"\s*:\s*([0-9a-zA-Z_\-]+)/i);
  if (idMatch) {
    result.id = idMatch[1];
  }

  return result;
}

function safeUnescapeUrl(u: string): string {
  let res = u || '';
  for (let i = 0; i < 4; i++) {
    if (res.includes('%')) {
      try {
        const next = decodeURIComponent(res);
        if (next === res) break;
        res = next;
      } catch (_) {
        break;
      }
    } else {
      break;
    }
  }
  return res;
}

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

// API Routes for 4K Community Voting (Supports Cloudflare D1 and Local Fallback)
app.get('/api/vote4k', async (c) => {
  try {
    const db = (c.env as any)?.DB || null;
    const state = await getVote4KState(db);
    return c.json(state);
  } catch (err: any) {
    console.error('[API] /api/vote4k error:', err);
    return c.json({ error: err.message || 'Ошибка сервера' }, 500);
  }
});

app.post('/api/vote4k/suggest', async (c) => {
  try {
    const db = (c.env as any)?.DB || null;
    const body = await c.req.json();
    const result = await suggestAnimeFor4K(body, db);
    return c.json(result);
  } catch (err: any) {
    console.error('[API] /api/vote4k/suggest error:', err);
    return c.json({ success: false, message: err.message || 'Ошибка при предложении тайтла' }, 500);
  }
});

app.post('/api/vote4k/upvote', async (c) => {
  try {
    const db = (c.env as any)?.DB || null;
    const { suggestionId, userEmail } = await c.req.json();
    const result = await upvoteSuggestion(suggestionId, userEmail, db);
    return c.json(result);
  } catch (err: any) {
    console.error('[API] /api/vote4k/upvote error:', err);
    return c.json({ success: false, message: err.message || 'Ошибка при голосовании' }, 500);
  }
});

app.post('/api/vote4k/vote-final', async (c) => {
  try {
    const db = (c.env as any)?.DB || null;
    const { candidateId, userEmail } = await c.req.json();
    const result = await voteFinalCandidate(candidateId, userEmail, db);
    return c.json(result);
  } catch (err: any) {
    console.error('[API] /api/vote4k/vote-final error:', err);
    return c.json({ success: false, message: err.message || 'Ошибка при финальном голосовании' }, 500);
  }
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

// In-memory cache for anime image URLs & AniList data
const animeImageCache = new Map<string, { url: string; buffer?: ArrayBuffer; contentType?: string }>();
const jikanImageCache = new Map<string, string>();

// API Route for Shikimori (Proxy with mirror fallback and AniList failover)
app.get('/api/shikimori/*', async (c) => {
  const path = c.req.path.replace(/^\/api\/shikimori/, '');
  const query = c.req.url.includes('?') ? c.req.url.substring(c.req.url.indexOf('?')) : '';
  
  const mirrors = [
    `https://shikimori.one/api${path}${query}`,
    `https://shikimori.io/api${path}${query}`,
    `https://desu.shikimori.one/api${path}${query}`
  ];

  // Try Shikimori mirrors with quick timeout
  try {
    const fetchPromises = mirrors.map(url =>
      fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://shikimori.one/',
          'Accept': 'application/json, text/plain, */*'
        },
        signal: AbortSignal.timeout(1500)
      }).then(async r => {
        if (r.ok) return await r.json();
        throw new Error(`HTTP ${r.status}`);
      })
    );

    const data = await Promise.any(fetchPromises);
    if (data) {
      return c.json(data);
    }
  } catch (_) {}

  // Fallback to AniList GraphQL if Shikimori is down/blocked
  if (path.startsWith('/animes')) {
    const idMatch = path.match(/^\/animes\/(\d+)$/);
    if (idMatch) {
      const animeId = parseInt(idMatch[1], 10);
      try {
        const anilistQuery = `query ($idMal: Int) { 
          Media(idMal: $idMal, type: ANIME) { 
            id 
            idMal 
            title { romaji english native } 
            description 
            episodes 
            status 
            format 
            seasonYear 
            averageScore 
            genres 
            studios(isMain: true) { nodes { name } } 
            coverImage { extraLarge large medium } 
            bannerImage 
            nextAiringEpisode { episode airingAt } 
          } 
        }`;
        const aniRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: anilistQuery, variables: { idMal: animeId } }),
          signal: AbortSignal.timeout(2500)
        });
        if (aniRes.ok) {
          const aniData = await aniRes.json() as any;
          const m = aniData?.data?.Media;
          if (m) {
            const coverUrl = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '';
            const mapped = {
              id: m.idMal || m.id,
              name: m.title?.romaji || m.title?.english,
              russian: m.title?.english || m.title?.romaji,
              image: {
                original: coverUrl,
                preview: m.coverImage?.large || coverUrl,
                x96: m.coverImage?.medium || coverUrl,
                x48: m.coverImage?.medium || coverUrl
              },
              url: `/animes/${m.idMal || m.id}`,
              kind: m.format ? m.format.toLowerCase() : 'tv',
              score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.0',
              status: m.status === 'RELEASING' ? 'ongoing' : (m.status === 'FINISHED' ? 'released' : 'anons'),
              episodes: m.episodes || 0,
              episodes_aired: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : (m.episodes || 0),
              aired_on: m.seasonYear ? `${m.seasonYear}-01-01` : null,
              released_on: null,
              description: m.description ? m.description.replace(/<[^>]*>?/gm, '') : 'Описание скоро появится',
              description_html: m.description,
              genres: (m.genres || []).map((g: string, idx: number) => ({ id: idx + 1, name: g, russian: g, kind: 'genre' })),
              studios: (m.studios?.nodes || []).map((s: any, idx: number) => ({ id: idx + 1, name: s.name, filtered_name: s.name, real: true, image: null }))
            };
            return c.json(mapped);
          }
        }
      } catch (_) {}
    } else {
      // List query fallback (e.g. popular / ongoing)
      try {
        const aniListQuery = `query { 
          Page(page: 1, perPage: 25) { 
            media(type: ANIME, sort: [POPULARITY_DESC, TRENDING_DESC]) { 
              id 
              idMal 
              title { romaji english native } 
              description 
              episodes 
              status 
              format 
              seasonYear 
              averageScore 
              genres 
              studios(isMain: true) { nodes { name } } 
              coverImage { extraLarge large medium } 
              bannerImage 
              nextAiringEpisode { episode airingAt } 
            } 
          } 
        }`;
        const aniRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: aniListQuery }),
          signal: AbortSignal.timeout(2500)
        });
        if (aniRes.ok) {
          const aniData = await aniRes.json() as any;
          const media = aniData?.data?.Page?.media || [];
          const mappedList = media.map((m: any) => {
            const coverUrl = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || '';
            return {
              id: m.idMal || m.id,
              name: m.title?.romaji || m.title?.english,
              russian: m.title?.english || m.title?.romaji,
              image: {
                original: coverUrl,
                preview: m.coverImage?.large || coverUrl,
                x96: m.coverImage?.medium || coverUrl,
                x48: m.coverImage?.medium || coverUrl
              },
              url: `/animes/${m.idMal || m.id}`,
              kind: m.format ? m.format.toLowerCase() : 'tv',
              score: m.averageScore ? (m.averageScore / 10).toFixed(1) : '8.0',
              status: m.status === 'RELEASING' ? 'ongoing' : (m.status === 'FINISHED' ? 'released' : 'anons'),
              episodes: m.episodes || 0,
              episodes_aired: m.nextAiringEpisode ? m.nextAiringEpisode.episode - 1 : (m.episodes || 0),
              aired_on: m.seasonYear ? `${m.seasonYear}-01-01` : null,
              released_on: null
            };
          });
          return c.json(mappedList);
        }
      } catch (_) {}
    }
  }

  // Graceful empty fallback for common public endpoints
  if (path.startsWith('/calendar') || path.startsWith('/topics') || path.startsWith('/animes')) {
    return c.json([], 200);
  }

  return c.json({ error: 'Shikimori upstream unavailable' }, 503);
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

const KNOWN_ANIMEGO_MAPPINGS: Record<string, AnimegoData> = {
  "39535": {
    animegoId: "1718",
    defaultAniboomUrl: "https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-1718",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-1718" },
      { voice: "Studio Band", url: "https://aniboom.one/embed/6XvYpL45p6e?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-1718" }
    ],
    quality: "1080",
    totalEpisodes: 11
  },
  "45576": {
    animegoId: "1845",
    defaultAniboomUrl: "https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-chast-2-1845",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-chast-2-1845" },
      { voice: "Studio Band", url: "https://aniboom.one/embed/M0l7qA5Wov7?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-chast-2-1845" }
    ],
    quality: "1080",
    totalEpisodes: 12
  },
  "51179": {
    animegoId: "2292",
    defaultAniboomUrl: "https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-2292",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-2292" },
      { voice: "Studio Band", url: "https://aniboom.one/embed/N0r7wP6Qov9?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-2292" }
    ],
    quality: "1080",
    totalEpisodes: 12
  },
  "55888": {
    animegoId: "2575",
    defaultAniboomUrl: "https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575" },
      { voice: "Studio Band", url: "https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575" }
    ],
    quality: "1080",
    totalEpisodes: 12
  },
  "59193": {
    animegoId: "2575",
    defaultAniboomUrl: "https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575",
    aniboomMap: [
      { voice: "AniLibria", url: "https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=2&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575" },
      { voice: "Studio Band", url: "https://aniboom.one/embed/z68qnBAqNvg?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-2-chast-2-2575" }
    ],
    quality: "1080",
    totalEpisodes: 12
  },
  "49926": {
    animegoId: "2035",
    defaultAniboomUrl: "https://aniboom.one/embed/k8Rq2b08awe?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-eris-ohota-na-goblinov-2035",
    aniboomMap: [
      { voice: "Studio Band", url: "https://aniboom.one/embed/k8Rq2b08awe?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Freinkarnaciya-bezrabotnogo-istoriya-o-priklyucheniyah-v-drugom-mire-eris-ohota-na-goblinov-2035" }
    ],
    quality: "1080",
    totalEpisodes: 1
  }
};

function isCandidateRelevant(candPath: string, queries: string[]): boolean {
  const normPath = candPath.toLowerCase();
  for (const q of queries) {
    const qWords = q.toLowerCase().split(/[^a-z0-9а-яё]+/i).filter(w => w.length >= 3);
    if (qWords.length === 0) continue;
    let matched = 0;
    for (const w of qWords) {
      if (normPath.includes(w)) matched++;
    }
    if (matched >= Math.min(2, Math.ceil(qWords.length * 0.4))) {
      return true;
    }
  }
  return false;
}

async function fetchAnimegoData(shikimoriId: string, searchTitle?: string): Promise<AnimegoData | null> {
  if (!shikimoriId) return null;
  
  if (KNOWN_ANIMEGO_MAPPINGS[shikimoriId]) {
    return KNOWN_ANIMEGO_MAPPINGS[shikimoriId];
  }

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
      signal: AbortSignal.timeout(5000)
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
          signal: AbortSignal.timeout(5000)
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

  // Only fallback if the candidate path actually relates to the queried title
  if (!matchedAnimegoId && candidates.length > 0) {
    const relevantCandidate = candidates.find(c => isCandidateRelevant(c.path, searchQueries));
    if (relevantCandidate) {
      console.warn(`[AnimeGo Scraper] Using relevant candidate match: ${relevantCandidate.path}`);
      matchedAnimegoId = relevantCandidate.id;
    } else {
      console.warn(`[AnimeGo Scraper] No candidates matched query keywords. Refusing random fallback.`);
    }
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
      signal: AbortSignal.timeout(5000)
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
        const providerTitle = fullTag.match(/data-provider-title="([^"]+)"/i)?.[1] ||
                              fullTag.match(/data-provider="([^"]+)"/i)?.[1];
        const translationTitle = fullTag.match(/data-translation-title="([^"]+)"/i)?.[1] ||
                                 fullTag.match(/data-dubbing-title="([^"]+)"/i)?.[1] ||
                                 fullTag.match(/data-translation="([^"]+)"/i)?.[1] ||
                                 fullTag.match(/data-voice="([^"]+)"/i)?.[1];

        if (providerTitle === 'AniBoom' || rawPlayerUrl.includes('aniboom')) {
          let cleanUrl = rawPlayerUrl;
          if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;
          
          if (translationTitle) {
            const voiceClean = translationTitle.trim();
            if (!aniboomMap.some(item => item.voice.toLowerCase() === voiceClean.toLowerCase())) {
              aniboomMap.push({ 
                voice: voiceClean, 
                url: cleanUrl,
                episodesCount: detectedEpisodes || undefined
              });
            }
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
      const qRes = await fetch(testUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://animego.me/'
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
    let bhcesh_iframe: string | null = null;
    let videocdn_iframe: string | null = null;
    let bazon_iframe: string | null = null;
    let hdvb_iframe: string | null = null;
    let iframe_video_iframe: string | null = null;
    let pleer_iframe: string | null = null;
    let anilibria_iframe: string | null = null;

    // Concurrently fetch alternate providers to minimize response latency
    const jobs: Promise<void>[] = [];

    // 3. Collaps (for iframe viewing playback)
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
              collaps_iframe = d.results[0].iframe_url;
              addLog(`Collaps found for viewing: ${collaps_iframe}`);
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
          console.debug('[VIDEOCDN] Service offline/blocked:', e.message);
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
          console.debug('[HDVB] Service offline/blocked:', e.message);
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

    // Build list of successfully resolved players (Aniboom button removed, parsed into unified player voiceovers)
    const players: any[] = [];
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

    const unifiedTranslations: any[] = [];

    // Step 1: Parse all AniBoom translations (labeled 4K)
    if (animego_aniboom_map && animego_aniboom_map.length > 0) {
      animego_aniboom_map.forEach((ab, idx) => {
        const baseVoice = cleanTitle(ab.voice || 'Основная озвучка');
        const normAb = normalizeVoice(baseVoice);
        const maxEpisodes = Math.max(
          animego_total_episodes || 0,
          ab.episodesCount || 0,
          1
        );

        // Find corresponding Kodik translation if available (for backup Kodik player)
        const matchedKodik = kodik_translations?.find((kt: any) => {
          const normKt = normalizeVoice(cleanTitle(kt.title || ''));
          return normKt === normAb || normKt.includes(normAb) || normAb.includes(normKt);
        });

        const kodikIframeTarget = matchedKodik?.iframe || (kodik_iframe || null);

        unifiedTranslations.push({
          id: `aniboom_${idx}_${normAb}`,
          title: baseVoice,
          type: 'voice',
          provider: 'AniBoom',
          iframe: ab.url,
          aniboom_iframe: ab.url,
          kodik_iframe: kodikIframeTarget,
          episodes_count: Math.max(maxEpisodes, matchedKodik?.episodes_count || 1, matchedKodik?.last_episode || 1),
          last_episode: Math.max(maxEpisodes, matchedKodik?.last_episode || 1, matchedKodik?.episodes_count || 1),
          quality_label: '4K',
          is_native_4k: true
        });
      });
    }

    // Step 2: Parse all Kodik translations (labeled 720p) if not already matched
    if (kodik_translations && kodik_translations.length > 0) {
      kodik_translations.forEach((kt: any, idx: number) => {
        const baseVoice = cleanTitle(kt.title || 'Озвучка Kodik');
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
            quality_label: '720p',
            is_native_4k: false
          });
        }
      });
    }

    // Step 3: Fallback if no voiceovers found in either map
    if (unifiedTranslations.length === 0) {
      if (aniboom_iframe) {
        const maxEpisodes = Math.max(animego_total_episodes || 0, 1);
        unifiedTranslations.push({
          id: 'aniboom_default',
          title: 'Основная озвучка (AniBoom)',
          type: 'voice',
          provider: 'AniBoom',
          iframe: aniboom_iframe,
          aniboom_iframe: aniboom_iframe,
          kodik_iframe: null,
          episodes_count: maxEpisodes,
          last_episode: maxEpisodes,
          quality_label: '4K',
          is_native_4k: true
        });
      }
      if (kodik_iframe) {
        unifiedTranslations.push({
          id: 'kodik_default',
          title: 'Основная озвучка (Kodik)',
          type: 'voice',
          provider: 'Kodik',
          iframe: kodik_iframe,
          aniboom_iframe: null,
          kodik_iframe: kodik_iframe,
          episodes_count: 1,
          last_episode: 1,
          quality_label: '720p',
          is_native_4k: false
        });
      }
    }

    // Step 4: Sort translations so 4K (AniBoom) top priority voices come FIRST, then other 4K, then 720p Kodik
    const priorityVoices = ['anilibria', 'дубляж', 'shiza', 'studioband', 'anidub', 'dreamcast', 'субтитры'];
    unifiedTranslations.sort((a, b) => {
      // 1. AniBoom 4K before Kodik 720p
      const aIs4k = a.quality_label === '4K' || a.is_native_4k || a.provider === 'AniBoom';
      const bIs4k = b.quality_label === '4K' || b.is_native_4k || b.provider === 'AniBoom';
      if (aIs4k && !bIs4k) return -1;
      if (!aIs4k && bIs4k) return 1;

      // 2. Priority voice names
      const aNorm = normalizeVoice(a.title);
      const bNorm = normalizeVoice(b.title);
      const aPriIdx = priorityVoices.findIndex(p => aNorm.includes(p));
      const bPriIdx = priorityVoices.findIndex(p => bNorm.includes(p));
      if (aPriIdx !== -1 && bPriIdx === -1) return -1;
      if (aPriIdx === -1 && bPriIdx !== -1) return 1;
      if (aPriIdx !== -1 && bPriIdx !== -1) {
        const diff = aPriIdx - bPriIdx;
        if (diff !== 0) return diff;
      }

      // 3. Highest episode count
      const aEp = a.episodes_count || a.last_episode || 0;
      const bEp = b.episodes_count || b.last_episode || 0;
      if (aEp !== bEp) return bEp - aEp;

      return 0;
    });

    kodik_translations = unifiedTranslations;

    console.log(`[BALANCER] Unification complete. Generated ${kodik_translations.length} translations (4K AniBoom + 720p Kodik).`);

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

import { resolveAnimeEpisodeToManga } from './server/animeBridge';

// ==========================================
// REAL-TIME RUSSIAN MANGA WEB SCRAPER/PROXY DECK (MangaDex, Shikimori, ReManga, MangaLib mock, MangaOvh mock)
// ==========================================
// ANIME-TO-MANGA CHAPTER ADAPTATION BRIDGE (MangaUpdates + Curated + Gemini AI)
app.get('/api/manga/anime-bridge', async (c) => {
  const title = c.req.query('title') || c.req.query('q') || c.req.query('search') || '';
  const episode = Number(c.req.query('episode') || c.req.query('ep') || '1');

  if (!title) {
    return c.json({ error: 'Anime title is required' }, 400);
  }

  try {
    const bridgeData = await resolveAnimeEpisodeToManga(title, episode);
    return c.json(bridgeData);
  } catch (err: any) {
    console.error('[anime-bridge] Error resolving:', err);
    return c.json({
      success: false,
      animeTitle: title,
      episode,
      mappedChapter: Math.max(1, Math.round(episode * 2)),
      adaptationSummary: `${episode} серия приблизительно соответствует ${Math.max(1, Math.round(episode * 2))} главе манги.`,
      source: 'algorithmic'
    });
  }
});

function normalizeMangaTitle(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitleMatch(candidateTitles: (string | undefined)[], searchTerms: (string | undefined)[]): number {
  let maxScore = 0;
  for (const term of searchTerms) {
    if (!term) continue;
    const normTerm = normalizeMangaTitle(term);
    if (!normTerm || normTerm.length < 1) continue;

    for (const raw of candidateTitles) {
      if (!raw) continue;
      const normCand = normalizeMangaTitle(raw);
      if (!normCand) continue;

      if (normCand === normTerm) {
        maxScore = Math.max(maxScore, 1000);
      } else if (normCand.startsWith(normTerm + " ") || normCand.endsWith(" " + normTerm)) {
        maxScore = Math.max(maxScore, 600 - Math.abs(normCand.length - normTerm.length));
      } else if (normCand.includes(normTerm)) {
        maxScore = Math.max(maxScore, Math.max(50, 400 - Math.abs(normCand.length - normTerm.length)));
      }
    }
  }
  return maxScore;
}

async function findBestMangaDexMatch(searchTitles: string[]): Promise<string> {
  let bestId = '';
  let highestScore = -1;

  for (const title of searchTitles) {
    if (!title) continue;
    try {
      const mdSearchUrl = `https://api.mangadex.org/manga?limit=10&title=${encodeURIComponent(title)}`;
      const mdRes = await fetch(mdSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const mdData = mdRes.ok ? await mdRes.json() : null;
      if (mdData && mdData.data && Array.isArray(mdData.data)) {
        for (const item of mdData.data) {
          const candTitles: string[] = [];
          if (item.attributes?.title) {
            candTitles.push(...Object.values(item.attributes.title) as string[]);
          }
          if (Array.isArray(item.attributes?.altTitles)) {
            for (const alt of item.attributes.altTitles) {
              candTitles.push(...Object.values(alt) as string[]);
            }
          }
          let score = scoreTitleMatch(candTitles, searchTitles);
          const follows = item.attributes?.followedCount || 0;
          if (follows > 50000) score += 100;
          else if (follows > 10000) score += 50;

          if (score > highestScore) {
            highestScore = score;
            bestId = item.id;
          }
        }
      }
    } catch (err) {}
    if (highestScore >= 1000) break;
  }

  return bestId;
}

async function findBestZazaSuggestion(searchTitles: string[]): Promise<string> {
  let bestLink = '';
  let highestScore = -1;

  for (const title of searchTitles) {
    if (!title) continue;
    try {
      const suggRes = await fetch('https://a.zazaza.me/search/suggestion?query=' + encodeURIComponent(title));
      if (suggRes.ok) {
        const suggData: any = await suggRes.json();
        if (suggData && Array.isArray(suggData.suggestions)) {
          for (const s of suggData.suggestions) {
            if (!s.link || (!s.link.startsWith('/') && !s.link.startsWith('http'))) continue;
            const candTitles = [s.value, ...(Array.isArray(s.names) ? s.names : [])];
            const score = scoreTitleMatch(candTitles, searchTitles);
            if (score > highestScore) {
              highestScore = score;
              bestLink = s.link;
            }
          }
        }
      }
    } catch (e) {}
    if (highestScore >= 1000) break;
  }

  return bestLink;
}

function extractBestMangaTitle(attrs: any): { title: string; originalTitle: string } {
  if (!attrs) return { title: 'Без названия', originalTitle: '' };

  const hasCyrillicOrLatin = (str: string) => /[a-zA-Zа-яА-ЯёЁ]/.test(str);

  let ruTitle = attrs.title?.ru;
  let enTitle = attrs.title?.en || attrs.title?.['ja-ro'];
  let altRu = '';
  let altEn = '';
  let altAnyLatinCyrillic = '';

  if (attrs.altTitles && Array.isArray(attrs.altTitles)) {
    for (const item of attrs.altTitles) {
      if (typeof item === 'object' && item !== null) {
        if (!altRu && item.ru) altRu = item.ru;
        if (!altEn && (item.en || item['ja-ro'])) altEn = item.en || item['ja-ro'];
        if (!altAnyLatinCyrillic) {
          const val = Object.values(item)[0];
          if (typeof val === 'string' && hasCyrillicOrLatin(val)) {
            altAnyLatinCyrillic = val;
          }
        }
      }
    }
  }

  let finalTitle = ruTitle || altRu || enTitle || altEn || altAnyLatinCyrillic;
  if (!finalTitle && attrs.title) {
    for (const val of Object.values(attrs.title)) {
      if (typeof val === 'string' && hasCyrillicOrLatin(val)) {
        finalTitle = val;
        break;
      }
    }
    if (!finalTitle) {
      finalTitle = (Object.values(attrs.title)[0] as string) || 'Без названия';
    }
  }

  const originalTitle = attrs.title?.['ja-ro'] || attrs.title?.ja || attrs.title?.en || attrs.title?.ko || '';

  return { title: finalTitle || 'Без названия', originalTitle };
}

function mergeAndDeduplicateChapters(allChapters: any[]): any[] {
  const chapterMap = new Map<string, any>();

  for (const ch of allChapters) {
    if (!ch || ch.chapter === undefined || ch.chapter === null) continue;
    const rawChapterStr = String(ch.chapter).trim();
    if (!rawChapterStr) continue;

    const parsedNum = parseFloat(rawChapterStr);
    const numKey = isNaN(parsedNum) ? rawChapterStr : String(parsedNum);

    if (!chapterMap.has(numKey)) {
      chapterMap.set(numKey, {
        ...ch,
        chapter: rawChapterStr
      });
    } else {
      const existing = chapterMap.get(numKey)!;
      const existingTitle = (existing.title || '').trim();
      const newTitle = (ch.title || '').trim();

      const existingIsGeneric = !existingTitle || existingTitle === 'Глава' || existingTitle === `Глава ${rawChapterStr}` || existingTitle === `Глава ${existing.chapter}`;
      const newIsGeneric = !newTitle || newTitle === 'Глава' || newTitle === `Глава ${rawChapterStr}` || newTitle === `Глава ${ch.chapter}`;

      if (existingIsGeneric && !newIsGeneric) {
        existing.title = newTitle;
      }

      if (!existing.volume && ch.volume) {
        existing.volume = ch.volume;
      }
    }
  }

  const merged = Array.from(chapterMap.values());
  merged.sort((a, b) => {
    const numA = parseFloat(a.chapter) || 0;
    const numB = parseFloat(b.chapter) || 0;
    return numA - numB;
  });

  return merged;
}

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
        
        const { title, originalTitle } = extractBestMangaTitle(attrs);
        let description = attrs.description?.ru || attrs.description?.en || 'Описание манги KamiAnime';
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
      }).filter(Boolean);
    }

    let shikiResults: any[] = [];
    if (shikiRes.status === 'fulfilled' && Array.isArray(shikiRes.value)) {
      shikiResults = shikiRes.value.map((m: any) => {
        const title = m.russian || m.name || 'Без названия';
        let cover = m.image?.original ? `/api/manga/page-proxy?url=${encodeURIComponent(`https://shikimori.one${m.image.original}`)}&_cb=3` : '';
        return {
          id: `shiki-${m.id}`,
          title,
          originalTitle: m.name || '',
          rating: m.score ? parseFloat(m.score) : 8.2,
          status: m.status === 'released' ? 'Завершен' : (m.status === 'ongoing' ? 'Онгоинг' : 'Анонс'),
          description: m.description || `Манга «${title}» (${m.name || ''}). Читать онлайн все главы на русском языке.`,
          cover,
          genres: [m.kind === 'manhwa' ? 'Манхва' : (m.kind === 'manhua' ? 'Маньхуа' : 'Манга')],
          chapters: m.chapters || m.volumes || 10
        };
      }).filter(Boolean);
    }

    let rmResults: any[] = [];
    if (rmRes.status === 'fulfilled' && rmRes.value && rmRes.value.content) {
      rmResults = rmRes.value.content.map((m: any) => {
        let title = m.rus_name || m.en_name || 'Без названия';
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
      if (!item || !item.title) return;
      const canonical = item.title.toLowerCase().trim();
      if (!seenTitles.has(canonical)) {
        seenTitles.add(canonical);
        interleaved.push(item);
      }
    };

    const maxLength = Math.max(shikiResults.length, rmResults.length, mdResults.length);
    for (let i = 0; i < maxLength; i++) {
      if (i < shikiResults.length) pushIfUnique(shikiResults[i]);
      if (i < rmResults.length) pushIfUnique(rmResults[i]);
      if (i < mdResults.length) pushIfUnique(mdResults[i]);
    }

    if (query) {
      interleaved.sort((a, b) => {
        const scoreA = scoreTitleMatch([a.title, a.originalTitle], [query]);
        const scoreB = scoreTitleMatch([b.title, b.originalTitle], [query]);
        return scoreB - scoreA;
      });
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
           const { title, originalTitle } = extractBestMangaTitle(attrs);
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
    const { title, originalTitle } = extractBestMangaTitle(attrs);
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
  let highestScore = -1;

  for (const title of uniqueTitles) {
    if (!title || title.trim().length < 2) continue;
    try {
      const searchRes = await fetch(`https://api.remanga.org/api/search/?query=${encodeURIComponent(title.trim())}&count=5`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://remanga.org/',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      if (!searchRes.ok) continue;
      const cType = searchRes.headers.get('content-type') || '';
      if (!cType.includes('application/json')) continue;

      const data: any = await searchRes.json();
      if (data && Array.isArray(data.content)) {
        for (const item of data.content) {
          if (!item.dir) continue;
          const candTitles = [item.rus_name, item.en_name, item.dir.replace(/-/g, ' ')].filter(Boolean);
          const score = scoreTitleMatch(candTitles, uniqueTitles);
          if (score > highestScore) {
            highestScore = score;
            remangaMangaDir = item.dir;
          }
        }
      }
    } catch (e) {}
    if (highestScore >= 1000) break;
  }

  if (!remangaMangaDir) return [];

  // Fetch branches
  try {
    const detailRes = await fetch(`https://api.remanga.org/api/titles/${remangaMangaDir}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://remanga.org/',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    if (!detailRes.ok) return [];
    const cType = detailRes.headers.get('content-type') || '';
    if (!cType.includes('application/json')) return [];

    const detailData: any = await detailRes.json();
    const content = detailData && detailData.content;
    if (!content || !content.branches || !Array.isArray(content.branches) || content.branches.length === 0) {
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://remanga.org/',
            'Accept': 'application/json, text/plain, */*'
          }
        });
        if (!chRes.ok) return;
        const chCType = chRes.headers.get('content-type') || '';
        if (!chCType.includes('application/json')) return;

        const chData: any = await chRes.json();
        const chList = chData && chData.content;
        if (Array.isArray(chList)) {
          chList.forEach((ch: any) => {
            const chNum = ch.chapter || '0';
            allChapters.push({
              id: `remanga-${ch.id}`,
              chapter: chNum.toString(),
              volume: (ch.volume || '').toString(),
              title: ch.name || `Глава ${ch.chapter || ''}`,
              group: 'Команда перевода',
              publishAt: ch.pub_date || new Date().toISOString()
            });
          });
        }

        const totalPages = Math.min(chData?.props?.total_pages || 1, 5);
        if (totalPages > 1) {
          const extraPromises = [];
          for (let p = 2; p <= totalPages; p++) {
            extraPromises.push(
              fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branchId}&limit=250&page=${p}`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Referer': 'https://remanga.org/',
                  'Accept': 'application/json, text/plain, */*'
                }
              }).then(r => r.ok ? r.json() : null).catch(() => null)
            );
          }
          const extraResults = await Promise.all(extraPromises);
          extraResults.forEach((pData: any) => {
            if (pData && Array.isArray(pData.content)) {
              pData.content.forEach((ch: any) => {
                const chNum = ch.chapter || '0';
                allChapters.push({
                  id: `remanga-${ch.id}`,
                  chapter: chNum.toString(),
                  volume: (ch.volume || '').toString(),
                  title: ch.name || `Глава ${ch.chapter || ''}`,
                  group: 'Команда перевода',
                  publishAt: ch.pub_date || new Date().toISOString()
                });
              });
            }
          });
        }
      } catch (err) {}
    }));

    return allChapters;
  } catch (err) {
    return [];
  }
}

// Helper to resolve Shikimori manga ID and fetch related + similar
async function fetchMangaRelatedAndSimilar(mangaId: string, titleHint?: string, altTitleHint?: string) {
  let shikiId: string | number = '';
  
  if (mangaId && mangaId.startsWith('shiki-')) {
    shikiId = mangaId.replace('shiki-', '');
  } else {
    const searchTerms: string[] = [];
    if (titleHint) searchTerms.push(titleHint);
    if (altTitleHint) searchTerms.push(altTitleHint);
    
    if (mangaId && mangaId.startsWith('remanga-')) {
      const cleanDir = mangaId.replace('remanga-', '');
      searchTerms.push(cleanDir.replace(/_/g, ' '));
    }
    
    for (const term of searchTerms) {
      if (!term || term.length < 2) continue;
      try {
        const sRes = await fetch(`https://shikimori.one/api/mangas?search=${encodeURIComponent(term)}&limit=1`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (sRes.ok) {
          const sData: any = await sRes.json();
          if (Array.isArray(sData) && sData.length > 0 && sData[0].id) {
            shikiId = sData[0].id;
            break;
          }
        }
      } catch (e) {}
    }
  }

  if (!shikiId) {
    return { success: true, related: [], similar: [] };
  }

  try {
    const [relRes, simRes] = await Promise.all([
      fetch(`https://shikimori.one/api/mangas/${shikiId}/related`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }),
      fetch(`https://shikimori.one/api/mangas/${shikiId}/similar`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      })
    ]);

    const relData: any = relRes.ok ? await relRes.json() : [];
    const simData: any = simRes.ok ? await simRes.json() : [];

    const related = Array.isArray(relData) ? relData.map((item: any) => {
      const relName = item.relation_russian || item.relation || 'Связанное';
      if (item.anime) {
        const a = item.anime;
        const imgUrl = a.image ? (a.image.original || a.image.preview || '') : '';
        const fullImg = imgUrl.startsWith('http') ? imgUrl : `https://shikimori.one${imgUrl}`;
        return {
          relation: relName,
          type: 'anime',
          anime: {
            id: a.id,
            title: a.russian || a.name,
            originalTitle: a.name,
            cover: imgUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(fullImg)}&_cb=3` : '',
            kind: a.kind,
            year: a.aired_on ? a.aired_on.slice(0, 4) : '',
            score: a.score
          }
        };
      } else if (item.manga) {
        const m = item.manga;
        const imgUrl = m.image ? (m.image.original || m.image.preview || '') : '';
        const fullImg = imgUrl.startsWith('http') ? imgUrl : `https://shikimori.one${imgUrl}`;
        return {
          relation: relName,
          type: 'manga',
          manga: {
            id: `shiki-${m.id}`,
            title: m.russian || m.name,
            originalTitle: m.name,
            cover: imgUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(fullImg)}&_cb=3` : '',
            kind: m.kind,
            score: m.score,
            status: m.status === 'released' ? 'Завершен' : 'Онгоинг'
          }
        };
      }
      return null;
    }).filter(Boolean) : [];

    const similar = Array.isArray(simData) ? simData.map((m: any) => {
      const imgUrl = m.image ? (m.image.original || m.image.preview || '') : '';
      const fullImg = imgUrl.startsWith('http') ? imgUrl : `https://shikimori.one${imgUrl}`;
      const kindLabel = m.kind === 'manhwa' ? 'Манхва' : (m.kind === 'manhua' ? 'Маньхуа' : 'Манга');
      return {
        id: `shiki-${m.id}`,
        title: m.russian || m.name,
        originalTitle: m.name,
        cover: imgUrl ? `/api/manga/page-proxy?url=${encodeURIComponent(fullImg)}&_cb=3` : '',
        rating: m.score ? parseFloat(m.score) : 8.0,
        status: m.status === 'released' ? 'Завершен' : 'Онгоинг',
        genres: [kindLabel],
        chapters: m.chapters || 0
      };
    }) : [];

    return { success: true, related, similar };
  } catch (e) {
    console.error('[API] Failed to fetch related/similar manga:', e);
    return { success: true, related: [], similar: [] };
  }
}

app.get('/api/manga/related-similar', async (c) => {
  const mangaId = c.req.query('id') || '';
  const titleHint = c.req.query('title') || '';
  const altTitleHint = c.req.query('altTitle') || '';
  const result = await fetchMangaRelatedAndSimilar(mangaId, titleHint, altTitleHint);
  return c.json(result);
});

app.get('/api/manga/:id/related-similar', async (c) => {
  const mangaId = c.req.param('id');
  const titleHint = c.req.query('title') || '';
  const altTitleHint = c.req.query('altTitle') || '';
  const result = await fetchMangaRelatedAndSimilar(mangaId, titleHint, altTitleHint);
  return c.json(result);
});

app.get('/api/manga/:id/chapters', async (c) => {
  let mangaId = c.req.param('id');
  let searchTitles: string[] = [];
  const qTitle = c.req.query('title');
  const qOrig = c.req.query('orig');
  if (qTitle) searchTitles.push(qTitle);
  if (qOrig) searchTitles.push(qOrig);

  // If starts with remanga-, get titles from ReManga and fast-track remangaDir
  let explicitRemangaDir = '';
  if (mangaId.startsWith('remanga-')) {
    explicitRemangaDir = mangaId.replace('remanga-', '');
    try {
      const rmRes = await fetch(`https://api.remanga.org/api/titles/${explicitRemangaDir}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://remanga.org/',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      if (rmRes.ok) {
        const cType = rmRes.headers.get('content-type') || '';
        if (cType.includes('application/json')) {
          const rmData: any = await rmRes.json();
          if (rmData && rmData.content) {
            if (rmData.content.rus_name) searchTitles.push(rmData.content.rus_name);
            if (rmData.content.en_name) searchTitles.push(rmData.content.en_name);
          }
        }
      }
    } catch(e) {}
    
    if (searchTitles.length === 0 && explicitRemangaDir) {
      searchTitles.push(explicitRemangaDir.replace(/-/g, ' '));
    }

    const matchedId = await findBestMangaDexMatch(searchTitles);
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

    const matchedId = await findBestMangaDexMatch(searchTitles);
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
  const zazaPath = await findBestZazaSuggestion(searchTitles);

  let zazaChapters: any[] = [];
  if (zazaPath) {
    try {
      const fullUrl = zazaPath.startsWith('http') ? zazaPath + '?mtr=1' : 'https://a.zazaza.me' + zazaPath + '?mtr=1';
      const htmlRes = await fetch(fullUrl, {
         headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
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
            zazaChapters.push({
               id: `zaza-${Buffer.from(targetUrl).toString('base64')}`,
               title: chTitle || 'Глава',
               volume: path.match(/vol(\d+)/)?.[1] || '1',
               chapter: path.match(/vol\d+\/([\d.,]+)/)?.[1] || '0',
               group: 'Команда перевода',
               publishAt: new Date().toISOString()
            });
        }
        zazaChapters.reverse();
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
          if (res.ok) {
            const data: any = await res.json();
            if (data && data.data && data.data.length > 0) {
              return data.data
                .filter((ch: any) => {
                  const attrs = ch.attributes || {};
                  return !attrs.externalUrl && (attrs.pages === undefined || attrs.pages > 0);
                })
                .map((ch: any) => {
                  const attrs = ch.attributes || {};
                  return {
                    id: ch.id,
                    chapter: attrs.chapter || '0',
                    volume: attrs.volume || '',
                    title: attrs.title || `Глава ${attrs.chapter || ''}`,
                    group: 'Команда перевода',
                    publishAt: attrs.publishAt
                  };
                });
            }
          }
        } catch(e) {}
        return [];
      };

      const [ru, en] = await Promise.all([getChapters('ru'), getChapters('en')]);
      return [...ru, ...en];
    }
    return [];
  };

  const fetchRM = async () => {
    if (explicitRemangaDir) {
      try {
        const detailRes = await fetch(`https://api.remanga.org/api/titles/${explicitRemangaDir}/`, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://remanga.org/',
            'Accept': 'application/json, text/plain, */*'
          }
        });
        if (!detailRes.ok) return [];
        const cType = detailRes.headers.get('content-type') || '';
        if (!cType.includes('application/json')) return [];

        const detailData: any = await detailRes.json();
        const branches = detailData?.content?.branches;
        if (!branches || !Array.isArray(branches) || !branches.length) return [];
        let rChapters: any[] = [];
        await Promise.allSettled(branches.map(async (branch: any) => {
          try {
            const chRes = await fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branch.id}&limit=250&page=1`, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': 'https://remanga.org/',
                'Accept': 'application/json, text/plain, */*'
              }
            });
            if (!chRes.ok) return;
            const chCType = chRes.headers.get('content-type') || '';
            if (!chCType.includes('application/json')) return;

            const chData: any = await chRes.json();
            if (Array.isArray(chData?.content)) {
              chData.content.forEach((ch: any) => {
                rChapters.push({
                  id: `remanga-${ch.id}`,
                  chapter: (ch.chapter || '0').toString(),
                  volume: (ch.volume || '').toString(),
                  title: ch.name || `Глава ${ch.chapter || ''}`,
                  group: 'Команда перевода',
                  publishAt: ch.pub_date || new Date().toISOString()
                });
              });
            }
          } catch(e) {}
        }));
        return rChapters;
      } catch(e) {
        return [];
      }
    }
    if (searchTitles.length > 0) {
      return await fetchRemangaChaptersByTitle(searchTitles);
    }
    return [];
  };

  // Run all scraping vectors in parallel to co-source all available Russian and alternative chapters
  const chapResults = await Promise.allSettled([fetchMD(), fetchRM()]);
  
  if (chapResults[0].status === 'fulfilled') {
    mdChapters = chapResults[0].value;
  }
  if (chapResults[1].status === 'fulfilled') {
    remangaChapters = chapResults[1].value;
  }

  const allChapters = [...remangaChapters, ...mdChapters, ...zazaChapters];

  const filteredChapters = mergeAndDeduplicateChapters(allChapters);

  return c.json({ chapters: filteredChapters, isLicensed: false });
});

app.get('/api/manga/chapter/:chapterId/pages', async (c) => {
  const chapterId = c.req.param('chapterId');
  
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
          return `/api/manga/page-proxy?url=${encodeURIComponent(fullUrl)}&_zaza=1`;
        });
        
        if (!isDeleted && pages.length > 0) {
          return c.json({ pages });
        }
      }

      // Automatic fallback for deleted/licensed chapters on ReadManga:
      const reqTitle = c.req.query('title') || '';
      const reqOrig = c.req.query('orig') || '';
      const pathPart = rawPath.split('?')[0];
      const matchVolChap = pathPart.match(/vol(\d+)\/([\d.,]+)/);
      const targetChapNum = matchVolChap ? matchVolChap[2] : '1';
      const rawSlug = pathPart.split('/')[1] || '';
      const cleanSlug = rawSlug.replace(/__.*$/, '').replace(/_/g, ' ').trim();

      const fallbackTitles = [reqTitle, reqOrig, cleanSlug].filter(Boolean);

      if (fallbackTitles.length > 0) {
        // Try ReManga fallback
        try {
          const rmSearch = await fetch(`https://api.remanga.org/api/search/?query=${encodeURIComponent(fallbackTitles[0])}&count=2`);
          const rmData: any = await rmSearch.json();
          const dir = rmData?.content?.[0]?.dir;
          if (dir) {
            const dtRes = await fetch(`https://api.remanga.org/api/titles/${dir}/`);
            const dtData: any = await dtRes.json();
            const branchId = dtData?.content?.branches?.[0]?.id;
            if (branchId) {
              const chRes = await fetch(`https://api.remanga.org/api/titles/chapters/?branch_id=${branchId}&limit=250&page=1`);
              const chData: any = await chRes.json();
              const matchedCh = chData?.content?.find((ch: any) => String(ch.chapter) === String(targetChapNum) || Math.abs(parseFloat(ch.chapter) - parseFloat(targetChapNum)) < 0.1);
              if (matchedCh?.id) {
                const pRes = await fetch(`https://api.remanga.org/api/titles/chapters/${matchedCh.id}/`);
                const pData: any = await pRes.json();
                const cObj = pData?.content;
                if (cObj?.pages || cObj?.scans) {
                  const servers = cObj.servers || ['https://img.remanga.org'];
                  const pageItems = cObj.pages || cObj.scans || [];
                  const pages = pageItems.map((page: any) => {
                    let link = typeof page === 'string' ? page : (Array.isArray(page) ? page[2] : (page.link || page.url || ''));
                    if (link && !link.startsWith('http')) {
                      const mainServer = servers[0] ? servers[0].replace(/\/$/, '') : 'https://img.remanga.org';
                      link = `${mainServer}${link.startsWith('/') ? link : '/' + link}`;
                    }
                    return link ? `/api/manga/page-proxy?url=${encodeURIComponent(link)}` : '';
                  }).filter(Boolean);

                  if (pages.length > 0) {
                    return c.json({ pages, isFallback: true });
                  }
                }
              }
            }
          }
        } catch(e) {}

        // Try MangaDex fallback
        try {
          const mdId = await findBestMangaDexMatch(fallbackTitles);
          if (mdId) {
            const feedRes = await fetch(`https://api.mangadex.org/manga/${mdId}/feed?translatedLanguage[]=ru&translatedLanguage[]=en&limit=500&order[chapter]=asc`);
            const feedData: any = await feedRes.json();
            if (feedData && feedData.data && Array.isArray(feedData.data)) {
              const isNumMatch = (chNum: any) => String(chNum) === String(targetChapNum) || Math.abs(parseFloat(chNum || '0') - parseFloat(targetChapNum)) < 0.01;
              const validChaps = feedData.data.filter((ch: any) => isNumMatch(ch.attributes?.chapter) && (ch.attributes?.pages > 0 || !ch.attributes?.externalUrl));

              let matchedDex = validChaps.find((ch: any) => ch.attributes?.translatedLanguage === 'ru');
              if (!matchedDex) matchedDex = validChaps.find((ch: any) => ch.attributes?.translatedLanguage === 'en');
              if (!matchedDex) matchedDex = validChaps[0];

              if (matchedDex?.id) {
                const srvRes = await fetch(`https://api.mangadex.org/at-home/server/${matchedDex.id}`);
                const srvData: any = await srvRes.json();
                if (srvData && srvData.chapter) {
                  const hash = srvData.chapter.hash;
                  const baseUrl = srvData.baseUrl;
                  const filenames = (srvData.chapter.data && srvData.chapter.data.length > 0) ? srvData.chapter.data : (srvData.chapter.dataSaver || []);
                  const pathPrefix = (srvData.chapter.data && srvData.chapter.data.length > 0) ? 'data' : 'data-saver';
                  const pages = filenames.map((fn: string) => `/api/manga/page-proxy?url=${encodeURIComponent(`${baseUrl}/${pathPrefix}/${hash}/${fn}`)}&chapterId=${matchedDex.id}`);
                  if (pages.length > 0) {
                    return c.json({ pages, isFallback: true });
                  }
                }
              }
            }
          }
        } catch(e) {}
      }

      return c.json({ error: 'Страницы этой главы временно недоступны на данном источнике. Выберите другую главу или перевод.', isLicensed: false, pages: [] });
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
          'Referer': 'https://remanga.org/',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      const data = await res.json().catch(() => null);
      const cObj = data && data.content;
      if (!cObj) {
        return c.json({ pages: [], error: 'Не удалось получить страницы главы с ReManga' });
      }

      const servers = cObj.servers || ['https://img.remanga.org'];
      const pageItems = cObj.pages || cObj.scans || cObj.images || [];
      const pages = pageItems.map((page: any) => {
        let link = "";
        if (typeof page === 'string') {
          link = page;
        } else if (page && typeof page === 'object') {
          if (Array.isArray(page)) {
            link = page[2] || page[0] || "";
          } else {
            link = page.link || page.url || page.image || page.photo || "";
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
      console.warn('[API] ReManga page fetch failed:', err);
      return c.json({ error: err.message, pages: [] });
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
    const data = await res.json().catch(() => null);
    if (!data || !data.chapter) {
      return c.json({ pages: [], error: 'Страницы главы не найдены на MangaDex' });
    }
    const hash = data.chapter.hash;
    const baseUrl = data.baseUrl;
    const filenames = (data.chapter.data && data.chapter.data.length > 0) ? data.chapter.data : (data.chapter.dataSaver || []);
    const isDataSaver = (!data.chapter.data || data.chapter.data.length === 0) && !!data.chapter.dataSaver;
    const pathPrefix = isDataSaver ? 'data-saver' : 'data';
    const pages = filenames.map((filename: string) => {
      const rawUrl = `${baseUrl}/${pathPrefix}/${hash}/${filename}`;
      return `/api/manga/page-proxy?url=${encodeURIComponent(rawUrl)}&chapterId=${chapterId}`;
    });
    return c.json({ pages });
  } catch (err: any) {
    return c.json({ error: err.message, pages: [] });
  }
});

// API Route for Anime-to-Manga Chapter Sync Bridge with Cloudflare D1 mapping
app.get('/api/manga/anime-bridge', async (c) => {
  const title = c.req.query('title') || '';
  const altTitle = c.req.query('altTitle') || '';
  const episode = parseInt(c.req.query('episode') || '1', 10);
  const season = c.req.query('season') || undefined;
  const shikimoriId = c.req.query('shikimoriId') || '';
  const db = (c.env as any)?.DB || null;

  if (!title.trim() && !altTitle.trim()) {
    return c.json({ error: 'Title or altTitle query parameter is required' }, 400);
  }

  try {
    const bridgeResult = await resolveAnimeEpisodeWithD1(db, title || altTitle, episode, season, shikimoriId, altTitle);
    return c.json(bridgeResult);
  } catch (err: any) {
    console.error('[API anime-bridge Error]:', err);
    return c.json({ error: err.message || 'Failed to resolve anime episode to manga' }, 500);
  }
});

// API Route for Image Proxy (matches Cloudflare Worker behavior)
app.get('/api/image/*', async (c) => {
  const imagePath = c.req.path.replace('/api/image/', '');
  const urlSearch = c.req.url.includes('?') ? c.req.url.substring(c.req.url.indexOf('?')) : '';
  const isExplicitlyMissing = imagePath.includes('missing') || imagePath.includes('none.png');
  
  // Extract anime ID if present
  const animeIdMatch = imagePath.match(/(?:animes|original|preview|x96|x48)\/(\d+)\.(?:jpg|png|webp|jpeg)/i) || 
                       imagePath.match(/\/(\d+)\.(?:jpg|png|webp|jpeg)$/) || 
                       c.req.url.match(/id=(\d+)/);
  const animeId = animeIdMatch ? parseInt(animeIdMatch[1], 10) : null;

  // Check in-memory AniList / Jikan cache first for instant response
  if (animeId && animeImageCache.has(animeId.toString())) {
    const cached = animeImageCache.get(animeId.toString())!;
    try {
      const cachedRes = await fetch(cached.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(2000)
      });
      if (cachedRes.ok) {
        return new Response(cachedRes.body, {
          status: 200,
          headers: {
            'Content-Type': cachedRes.headers.get('content-type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=2592000',
            'Access-Control-Allow-Origin': '*',
            'X-Image-Source': 'Cached-Fallback'
          }
        });
      }
    } catch (_) {}
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Referer': 'https://shikimori.one/',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  };

  try {
    const fetchTasks: Promise<Response>[] = [];

    // Shikimori mirror tasks
    if (!isExplicitlyMissing) {
      const mirrors = [
        `https://shikimori.one/${imagePath}${urlSearch}`,
        `https://shikimori.io/${imagePath}${urlSearch}`,
        `https://desu.shikimori.one/${imagePath}${urlSearch}`
      ];
      for (const mUrl of mirrors) {
        fetchTasks.push(
          fetch(mUrl, { headers, signal: AbortSignal.timeout(1200) }).then(r => {
            if (r.ok && !r.url.includes('missing') && !r.url.includes('none.png')) return r;
            throw new Error('Not ok');
          })
        );
      }
    }

    // AniList GraphQL parallel task if anime ID is known
    if (animeId) {
      fetchTasks.push(
        (async () => {
          const anilistQuery = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { coverImage { extraLarge large medium } bannerImage } }`;
          const aniRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: anilistQuery, variables: { idMal: animeId } }),
            signal: AbortSignal.timeout(2000)
          });
          if (aniRes.ok) {
            const aniData = await aniRes.json() as any;
            const media = aniData?.data?.Media;
            const isCoverOrBanner = imagePath.includes('cover') || imagePath.includes('original') || c.req.url.includes('type=cover');
            const imgUrl = (isCoverOrBanner && media?.bannerImage) ? media.bannerImage : (media?.coverImage?.extraLarge || media?.coverImage?.large || media?.coverImage?.medium || media?.bannerImage);
            if (imgUrl) {
              animeImageCache.set(animeId.toString(), { url: imgUrl });
              const aniImgRes = await fetch(imgUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                signal: AbortSignal.timeout(2500)
              });
              if (aniImgRes.ok) return aniImgRes;
            }
          }
          throw new Error('AniList miss');
        })()
      );
    }

    try {
      const winner = await Promise.any(fetchTasks);
      if (winner && winner.ok) {
        return new Response(winner.body, {
          status: 200,
          headers: {
            'Content-Type': winner.headers.get('content-type') || 'image/jpeg',
            'Cache-Control': 'public, max-age=2592000',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    } catch (_) {}

    // Fallback to Jikan API
    if (animeId) {
      try {
        let imageUrl = jikanImageCache.get(animeId.toString());
        if (!imageUrl) {
          const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`, { signal: AbortSignal.timeout(2000) });
          if (jikanRes.ok) {
            const jikanData = await jikanRes.json() as any;
            imageUrl = jikanData.data?.images?.jpg?.large_image_url || jikanData.data?.images?.jpg?.image_url;
            if (imageUrl) jikanImageCache.set(animeId.toString(), imageUrl);
          }
        }
        if (imageUrl) {
          const fallbackRes = await fetch(imageUrl, { signal: AbortSignal.timeout(2000) });
          if (fallbackRes.ok) {
            return new Response(fallbackRes.body, {
              status: 200,
              headers: {
                'Content-Type': fallbackRes.headers.get('content-type') || 'image/jpeg',
                'Cache-Control': 'public, max-age=2592000',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
        }
      } catch (_) {}
    }
    
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#141519"/><circle cx="300" cy="400" r="45" fill="#252438"/><polygon points="285,380 285,420 325,400" fill="#8B5CF6"/><text x="300" y="490" font-family="sans-serif" font-size="22" font-weight="700" fill="#e2e8f0" text-anchor="middle">KamiAnime</text><text x="300" y="525" font-family="sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Обложка</text></svg>`;
    return new Response(fallbackSvg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
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
    const refererParam = c.req.query('referer');
    const isAniboomHost = targetUrl.includes('ya-ligh') || targetUrl.includes('aniboom') || targetUrl.includes('boom-img') || targetUrl.includes('.m4s') || targetUrl.includes('.ts') || targetUrl.includes('.mpd');
    const reqHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': refererParam || (isAniboomHost ? 'https://aniboom.one/' : 'https://shikimori.one/')
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

    // Handle DASH manifest (.mpd)
    if (contentType.includes('dash+xml') || contentType.includes('application/xml') || targetUrl.includes('.mpd')) {
      let xmlText = await res.text();
      const lastSlash = targetUrl.lastIndexOf('/');
      const baseCdn = targetUrl.substring(0, lastSlash + 1);

      // Важно: в XML амперсанд ДОЛЖЕН быть &amp;, чтобы dash.js не падал
      const proxyBase = `/api/proxy-4k?url=${encodeURIComponent(baseCdn)}&amp;referer=${encodeURIComponent('https://aniboom.one/')}`;

      // Сносим старые BaseURL (если были) и ставим наш
      xmlText = xmlText.replace(/<BaseURL>[\s\S]*?<\/BaseURL>/gi, '');
      xmlText = xmlText.replace(/<MPD(\s|>)/i, `<MPD $1<BaseURL>${proxyBase}</BaseURL>`);

      return new Response(xmlText, {
        status: 200,
        headers: {
          'Content-Type': 'application/dash+xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }
    
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
      const safeReferer = refererParam ? `&referer=${encodeURIComponent(refererParam)}` : '&referer=https%3A%2F%2Faniboom.one%2F';
      
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
              return `URI="/api/proxy-4k?url=${encodeURIComponent(absUrl)}${safeReferer}"`;
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
        return `/api/proxy-4k?url=${encodeURIComponent(absUrl)}${safeReferer}`;
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

app.get('/api/anime/:id', async (c) => {
  const rawId = c.req.param('id');
  const shikimoriId = rawId ? rawId.split('-')[0] : '';
  if (!shikimoriId) return c.json({ error: 'shikimori_id is required' }, 400);

  let aniboomVoices: any[] = [];
  let aniboomId: string | null = null;
  let animegoSlug: string | null = null;
  let titleRu: string | null = null;

  try {
    const workerRes = await fetch(`https://parser.oshxycfdjab.workers.dev/?shikimori_id=${shikimoriId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3500)
    });
    if (workerRes.ok) {
      const workerData = await workerRes.json() as any;
      if (workerData?.voices && Array.isArray(workerData.voices)) {
        aniboomVoices = workerData.voices;
      }
      if (workerData?.aniboom_id) aniboomId = workerData.aniboom_id;
    }
  } catch (_) {}

  if (aniboomVoices.length === 0) {
    try {
      const animegoData = await fetchAnimegoData(shikimoriId);
      if (animegoData && animegoData.aniboomMap) {
        aniboomVoices = animegoData.aniboomMap.map((m, idx) => ({
          voice: m.voice,
          aniboom_id: animegoData.animegoId || `ab_${idx}`,
          url: m.url
        }));
        aniboomId = animegoData.animegoId || null;
      }
    } catch (_) {}
  }

  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Cache-Control', 'public, max-age=300');

  return c.json({
    shikimori_id: shikimoriId,
    aniboom_id: aniboomId,
    animego_slug: animegoSlug,
    title_ru: titleRu,
    voices: aniboomVoices
  });
});

app.get('/api/aniboom', async (c) => {
  const shikimoriId = c.req.query('shikimori_id') || c.req.query('id');
  if (!shikimoriId) return c.json({ error: 'shikimori_id is required' }, 400);

  let aniboomVoices: any[] = [];
  let aniboomId: string | null = null;
  let animegoSlug: string | null = null;
  let titleRu: string | null = null;

  try {
    const workerRes = await fetch(`https://parser.oshxycfdjab.workers.dev/?shikimori_id=${shikimoriId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3500)
    });
    if (workerRes.ok) {
      const workerData = await workerRes.json() as any;
      if (workerData?.voices && Array.isArray(workerData.voices)) {
        aniboomVoices = workerData.voices;
      }
      if (workerData?.aniboom_id) aniboomId = workerData.aniboom_id;
    }
  } catch (_) {}

  if (aniboomVoices.length === 0) {
    try {
      const animegoData = await fetchAnimegoData(shikimoriId);
      if (animegoData && animegoData.aniboomMap) {
        aniboomVoices = animegoData.aniboomMap.map((m, idx) => ({
          voice: m.voice,
          aniboom_id: animegoData.animegoId || `ab_${idx}`,
          url: m.url
        }));
        aniboomId = animegoData.animegoId || null;
      }
    } catch (_) {}
  }

  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Cache-Control', 'public, max-age=300');

  return c.json({
    shikimori_id: shikimoriId,
    aniboom_id: aniboomId,
    animego_slug: animegoSlug,
    title_ru: titleRu,
    voices: aniboomVoices
  });
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

app.get('/api/kodik/embed', (c) => {
  let urlParam = c.req.query('url');
  if (!urlParam) {
    return c.text('url parameter is required', 400);
  }

  if (urlParam.startsWith('//')) {
    urlParam = `https:${urlParam}`;
  }

  // Kodik mirror fallback optimization
  let sanitizedUrl = urlParam;
  if (!sanitizedUrl.includes('kodikplayer.com') && !sanitizedUrl.includes('anivod.com') && !sanitizedUrl.includes('kodik.info')) {
    sanitizedUrl = sanitizedUrl.replace(/\/\/(kodik\.biz|kodik\.cc|kodik\.link|kodik\.me)\//i, '//kodikplayer.com/');
  }

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>KamiPlayer Kodik</title>
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
    src="${sanitizedUrl.replace(/"/g, '&quot;')}"
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
      title: "Запрос к D1 Резолверу",
      status: "info",
      message: `Поиск плеера по Shikimori ID в базе Cloudflare D1...`
    });
    try {
      const workerRes = await fetch(`https://parser.oshxycfdjab.workers.dev/?shikimori_id=${shikimori_id}&episode=${episode || 1}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (workerRes.ok) {
        const workerData = await workerRes.json();
        if (workerData && workerData.source === 'aniboom' && workerData.embed_url) {
          targetEmbedUrl = workerData.embed_url;
          steps.push({
            title: "Запрос к D1 Резолверу",
            status: "success",
            message: `Успешно получен AniBoom Embed URL из Cloudflare D1: ${targetEmbedUrl}`
          });
        }
      }
    } catch (_) {}

    if (!targetEmbedUrl) {
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
    // CRITICAL: Only set translation param if translation_id is numeric and explicitly provided!
    // Never put non-numeric strings or force translation=16 onto AniBoom embeds!
    if (translation_id && /^\d+$/.test(String(translation_id))) {
      u.searchParams.set('translation', String(translation_id));
    }
    cleanEmbedUrl = u.toString();
  } catch (_) {
    if (!cleanEmbedUrl.includes('episode=')) {
      cleanEmbedUrl += (cleanEmbedUrl.includes('?') ? '&' : '?') + `episode=${episode}`;
    }
    if (translation_id && /^\d+$/.test(String(translation_id)) && !cleanEmbedUrl.includes('translation=')) {
      cleanEmbedUrl += (cleanEmbedUrl.includes('?') ? '&' : '?') + `translation=${translation_id}`;
    }
  }

  // Extract parent parameter for Referer header matching
  let referer = 'https://animego.me/';
  const parentMatch = cleanEmbedUrl.match(/[?&]parent=([^&]+)/i);
  if (parentMatch) {
    const decodedParent = safeUnescapeUrl(parentMatch[1]);
    if (decodedParent.startsWith('http://') || decodedParent.startsWith('https://')) {
      referer = decodedParent;
    }
  } else {
    // If parent is missing, attach parent to URL so AniBoom security validation passes
    cleanEmbedUrl += (cleanEmbedUrl.includes('?') ? '&' : '?') + `parent=${encodeURIComponent(referer)}`;
  }

  steps.push({
    title: "Конечный Embed URL",
    status: "success",
    message: `Используется нормализованный URL плеера: ${cleanEmbedUrl} (Referer: ${referer})`
  });

  // Step 2: Get HTML of Aniboom embed
  steps.push({
    title: "Загрузка HTML страницы плеера",
    status: "info",
    message: "Отправка GET-запроса на получение страницы плеера AniBoom..."
  });
  try {
    const originHost = referer.startsWith('http') ? new URL(referer).origin : 'https://animego.me';
    const aRes = await fetch(cleanEmbedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer,
        'Origin': originHost,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site'
      },
      signal: AbortSignal.timeout(4000)
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

    let match = html.match(/data-parameters=["']([^"']+)["']/i);
    let rawParams = '';

    if (match) {
      rawParams = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'");
    } else {
      const jsMatch = html.match(/(?:window\.)?parameters\s*=\s*({.+?});/s) || 
                      html.match(/data-aspect-ratio[^>]*data-parameters="([^"]+)"/i);
      if (jsMatch) {
        rawParams = jsMatch[1];
      }
    }

    if (!rawParams && cleanEmbedUrl.includes('translation=')) {
      try {
        const retryEmbedUrl = cleanEmbedUrl.replace(/[?&]translation=\d+/g, '').replace(/\?&/, '?').replace(/\?$/, '');
        const retryRes = await fetch(retryEmbedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': referer,
            'Origin': originHost,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Sec-Fetch-Dest': 'iframe',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site'
          },
          signal: AbortSignal.timeout(3500)
        });
        if (retryRes.ok) {
          const retryHtml = await retryRes.text();
          const retryMatch = retryHtml.match(/data-parameters=["']([^"']+)["']/i);
          if (retryMatch) {
            rawParams = retryMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'");
          } else {
            const retryJsMatch = retryHtml.match(/(?:window\.)?parameters\s*=\s*({.+?});/s) ||
                                retryHtml.match(/data-aspect-ratio[^>]*data-parameters="([^"]+)"/i);
            if (retryJsMatch) {
              rawParams = retryJsMatch[1];
            }
          }
        }
      } catch (_) {}
    }

    if (!rawParams) {
      return await tryKodikFallback('data-parameters not found');
    }
    const decoded: any = safeParseParams(rawParams);
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

    const extractSrc = (data: any): string => {
      if (!data) return '';
      let target = data;
      if (typeof target === 'string') {
        const unescaped = target.replace(/\\"/g, '"').replace(/\\\//g, '/');
        try {
          target = JSON.parse(unescaped);
        } catch (_) {
          return unescaped;
        }
      }
      if (typeof target === 'object' && target !== null) {
        return target['1080'] || target['720'] || target.src || target.url || '';
      }
      return '';
    };

    let dashSrc = extractSrc(decoded.dash);
    let hlsSrc = extractSrc(decoded.hls);

    if (dashSrc.startsWith('//')) dashSrc = `https:${dashSrc}`;
    if (hlsSrc.startsWith('//')) hlsSrc = `https:${hlsSrc}`;

    // Prefer HLS (.m3u8) from Aniboom parameters
    const primarySrc = hlsSrc || dashSrc;
    const streamType = hlsSrc ? 'hls' : (dashSrc ? 'dash' : 'hls');

    steps.push({
      title: "Анализ медиа-потоков",
      status: primarySrc ? "success" : "error",
      message: primarySrc 
        ? `Найдены потоки. Выбран формат: ${streamType.toUpperCase()}. Ссылка: ${primarySrc}`
        : "Не найдено ни одного валидного потока HLS (.m3u8) или DASH (.mpd) в параметрах AniBoom."
    });

    if (!primarySrc) {
      return await tryKodikFallback('No valid HLS (.m3u8) or DASH (.mpd) video stream found in Aniboom parameters');
    }

    steps.push({
      title: "Настройка 4K прокси",
      status: "info",
      message: "Генерация безопасной прокси-ссылки для обхода CORS и заголовков Referer..."
    });

    const proxyOrigin = getProxyOrigin(c);
    const proxiedHlsUrl = hlsSrc ? `${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(hlsSrc)}` : undefined;
    const proxiedDashUrl = dashSrc ? `${proxyOrigin}/api/proxy-4k?url=${encodeURIComponent(dashSrc)}` : undefined;
    const mainProxiedUrl = proxiedHlsUrl || proxiedDashUrl || '';

    steps.push({
      title: "Настройка 4K прокси",
      status: "success",
      message: `Ссылка на поток готова: ${mainProxiedUrl.substring(0, 80)}...`
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
      dash_url: dashSrc || proxiedDashUrl,
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

// In-memory 4-hour cache for direct AniBoom Master HLS links
const playlistCache = new Map<string, { streamUrl?: string; rawUrl?: string; result?: any; exp: number }>();

async function extractKodikStream(iframeUrl: string, requestedQuality?: string, resolveOnly?: boolean, c?: any) {
  const cacheKey = `kodik_${iframeUrl}_${requestedQuality}_${resolveOnly}`;
  const cached = playlistCache.get(cacheKey);
  if (cached && cached.exp > Date.now()) {
    return cached.result;
  }

  let normalizedIframe = iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl;
  
  // Extract base domain and test candidate mirror domains
  let targetDomains: string[] = [];
  try {
    const u = new URL(normalizedIframe);
    if (u.hostname) targetDomains.push(u.hostname);
  } catch (_) {}

  const mirrorFallbacks = ['kodik.info', 'kodik.biz', 'kodik.cc', 'kodikplayer.com', 'kodikonline.com', 'anivod.com'];
  for (const m of mirrorFallbacks) {
    if (!targetDomains.includes(m)) targetDomains.push(m);
  }

  let html = '';
  let successfulIframe = normalizedIframe;

  for (const domain of targetDomains) {
    try {
      const candidateUrl = normalizedIframe.replace(/(kodik\.info|kodik\.cc|kodik\.biz|kodik\.net|kodik\.tv|kodik\.club|kodik\.site|kodik\.space|kodik\.ru|kodikonline\.com|kodikhd\.club|kodik-api\.com|kodikplayer\.com|anivod\.com)/g, domain);
      console.log(`[KODIK PROXY] Trying Kodik mirror: ${candidateUrl}`);
      const iframeRes = await fetch(candidateUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://shikimori.one/'
        },
        signal: AbortSignal.timeout(4000)
      });
      if (iframeRes.ok) {
        const text = await iframeRes.text();
        if (text.includes('urlParams') || text.includes('.hash') || text.includes('videoInfo')) {
          html = text;
          successfulIframe = candidateUrl;
          break;
        }
      }
    } catch (e: any) {
      console.warn(`[KODIK PROXY] Mirror ${domain} failed: ${e.message}`);
    }
  }

  if (!html) {
    throw new Error('Failed to fetch valid Kodik player page from any mirror');
  }

  const urlParamsMatch = html.match(/urlParams\s*=\s*'([^']+)'/) || html.match(/urlParams\s*=\s*"([^"]+)"/) || html.match(/urlParams\s*=\s*({[^;]+})/);
  const hashMatch = html.match(/\.hash\s*=\s*'([^']+)'/) || html.match(/\.hash\s*=\s*"([^"]+)"/) || html.match(/\.hash\s*=\s*['"]([^'"]+)['"]/);
  const idMatch = html.match(/\.id\s*=\s*'([^']+)'/) || html.match(/\.id\s*=\s*"([^"]+)"/) || html.match(/\.id\s*=\s*['"]([^'"]+)['"]/);
  const typeMatch = html.match(/\.type\s*=\s*'([^']+)'/) || html.match(/\.type\s*=\s*"([^"]+)"/) || html.match(/\.type\s*=\s*['"]([^'"]+)['"]/);

  if (!urlParamsMatch || !hashMatch || !idMatch || !typeMatch) {
    throw new Error('Failed to parse Kodik iframe parameters');
  }

  const urlParams = typeof urlParamsMatch[1] === 'string' && urlParamsMatch[1].startsWith('{') 
    ? JSON.parse(urlParamsMatch[1]) 
    : JSON.parse(urlParamsMatch[1]);
  const videoHash = hashMatch[1];
  const videoId = idMatch[1];
  const videoType = typeMatch[1];

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
    scriptUrl = '/assets/js/app.serial.js';
  }

  const baseUrlObj = new URL(successfulIframe);
  const scriptAbsoluteUrl = scriptUrl.startsWith('http') ? scriptUrl : `${baseUrlObj.protocol}//${baseUrlObj.host}${scriptUrl}`;

  const scriptRes = await fetch(scriptAbsoluteUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': successfulIframe
    }
  });
  const scriptHtml = await scriptRes.text();

  const ajaxMatch = scriptHtml.match(/\$.ajax\([\s\S]*?url:\s*atob\("([^"]+)"\)/) || 
                    scriptHtml.match(/atob\("([^"'\(\)]+)"\)/);
  if (!ajaxMatch) {
    throw new Error('Could not extract player API script');
  }

  const gboxPath = atob(ajaxMatch[1]);
  const gboxUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${gboxPath}`;

  const payload = new URLSearchParams({
    hash: videoHash,
    id: videoId,
    type: videoType,
    d: urlParams.d || baseUrlObj.hostname || 'kodik.info',
    d_sign: urlParams.d_sign || '',
    pd: urlParams.pd || '',
    pd_sign: urlParams.pd_sign || '',
    ref: decodeURIComponent(urlParams.ref || ''),
    ref_sign: urlParams.ref_sign || '',
    bad_user: 'true',
    cdn_is_working: 'true'
  });

  const gboxRes = await fetch(gboxUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': normalizedIframe
    },
    body: payload.toString()
  });

  const gboxData = await gboxRes.json() as any;
  if (!gboxData || !gboxData.links) {
    throw new Error('Failed to retrieve stream links from Kodik');
  }

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

  const qualities = Object.keys(resolvedLinks).map(Number).sort((a, b) => b - a);
  if (qualities.length === 0) {
    throw new Error('No working qualities resolved from Kodik');
  }

  if (resolveOnly) {
    const highestQ = qualities[0];
    const directSrc = resolvedLinks[String(highestQ)];
    const resObj = {
      type: 'json',
      data: {
        success: true,
        streamType: 'hls',
        qualities,
        quality: highestQ,
        direct_url: directSrc,
        url: `/api/proxy-4k?url=${encodeURIComponent(directSrc)}`
      }
    };
    playlistCache.set(cacheKey, { result: resObj, exp: Date.now() + 1800000 });
    return resObj;
  }

  if (requestedQuality && resolvedLinks[requestedQuality]) {
    const targetSrc = resolvedLinks[requestedQuality];
    const resObj = {
      type: 'redirect',
      url: `/api/proxy-4k?url=${encodeURIComponent(targetSrc)}`
    };
    playlistCache.set(cacheKey, { result: resObj, exp: Date.now() + 1800000 });
    return resObj;
  }

  // Master playlist
  const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3'];
  for (const q of qualities) {
    const qSrc = resolvedLinks[String(q)];
    if (!qSrc) continue;
    let bandwidth = 1400000;
    let width = 1280;
    let height = 720;
    if (q >= 1080) { bandwidth = 3200000; width = 1920; height = 1080; }
    else if (q >= 720) { bandwidth = 2000000; width = 1280; height = 720; }
    else if (q >= 480) { bandwidth = 1000000; width = 854; height = 480; }
    else { bandwidth = 500000; width = 640; height = 360; }

    masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height},NAME="${q}p"`);
    masterLines.push(`/api/proxy-4k?url=${encodeURIComponent(qSrc)}`);
  }

  const resObj = {
    type: 'text',
    contentType: 'application/vnd.apple.mpegurl; charset=utf-8',
    data: masterLines.join('\n')
  };
  playlistCache.set(cacheKey, { result: resObj, exp: Date.now() + 1800000 });
  return resObj;
}

app.get('/api/media/playlist', async (c) => {
  const reqUrl = c.req.url;
  let targetUrl = c.req.query('url');
  const fallbackUrl = c.req.query('fallback_url');
  const resolveOnly = c.req.query('resolve') === 'true';
  const requestedQuality = c.req.query('quality');

  let cleanTargetUrl = '';
  if (reqUrl.includes('aniboom.one')) {
    const rawAniboom = reqUrl.substring(reqUrl.indexOf('http'));
    let decoded = rawAniboom;
    for (let i = 0; i < 4; i++) {
      if (decoded.includes('%')) {
        try { decoded = decodeURIComponent(decoded); } catch (_) { break; }
      } else { break; }
    }
    if (decoded.includes('&fallback_url=')) {
      decoded = decoded.split('&fallback_url=')[0];
    }
    cleanTargetUrl = decoded;
  } else if (targetUrl) {
    try {
      cleanTargetUrl = decodeURIComponent(targetUrl);
    } catch (_) {
      cleanTargetUrl = targetUrl;
    }
  }

  if (!cleanTargetUrl) {
    if (fallbackUrl) {
      cleanTargetUrl = fallbackUrl;
    } else {
      return c.json({ error: 'Missing url parameter' }, 400);
    }
  }

  let cleanFallbackUrl = fallbackUrl ? safeUnescapeUrl(fallbackUrl) : '';

  // Recursively extract nested /api/media/playlist?url=...
  while (cleanTargetUrl.includes('/api/media/playlist') && cleanTargetUrl.includes('url=')) {
    try {
      const parsed = new URL(cleanTargetUrl, 'http://localhost');
      const nested = parsed.searchParams.get('url');
      if (nested) {
        cleanTargetUrl = safeUnescapeUrl(nested);
      } else {
        break;
      }
    } catch (_) {
      break;
    }
  }

  if (cleanFallbackUrl) {
    while (cleanFallbackUrl.includes('/api/media/playlist') && cleanFallbackUrl.includes('url=')) {
      try {
        const parsed = new URL(cleanFallbackUrl, 'http://localhost');
        const nested = parsed.searchParams.get('url');
        if (nested) {
          cleanFallbackUrl = safeUnescapeUrl(nested);
        } else {
          break;
        }
      } catch (_) {
        break;
      }
    }
  }

  // 1. Check in-memory cache
  const now = Date.now();
  const cached = playlistCache.get(cleanTargetUrl);
  let rawStreamUrl = (cached && cached.exp > now) ? cached.rawUrl : '';
  let finalStreamUrl = (cached && cached.exp > now) ? cached.streamUrl : '';

  // 2. If Kodik embed URL: resolve Kodik HLS streams directly
  if (!cleanTargetUrl.includes('aniboom') && (cleanTargetUrl.includes('kodik') || cleanTargetUrl.includes('kodikplayer') || cleanTargetUrl.includes('/seria/') || cleanTargetUrl.includes('/video/'))) {
    try {
      const kodikResult = await extractKodikStream(cleanTargetUrl, requestedQuality, resolveOnly, c);
      if (kodikResult.type === 'json') {
        return c.json(kodikResult.data);
      }
      if (kodikResult.type === 'redirect') {
        return c.redirect(kodikResult.url, 302);
      }
      c.header('Content-Type', kodikResult.contentType);
      c.header('Access-Control-Allow-Origin', '*');
      return c.text(kodikResult.data);
    } catch (kodikErr: any) {
      console.warn(`[Kodik Stream Extraction Error]: ${kodikErr.message}`);
      return c.json({ error: 'kodik_stream_failed', message: kodikErr.message }, 502);
    }
  }

  // 3. If direct link: handle as direct link
  if (!cleanTargetUrl.includes('aniboom')) {
    if (resolveOnly) {
      return c.json({
        success: true,
        streamType: 'hls',
        qualities: [720, 480, 360],
        quality: 720,
        direct_url: cleanTargetUrl,
        url: `/api/proxy-4k?url=${encodeURIComponent(cleanTargetUrl)}`
      });
    }

    if (requestedQuality) {
      try {
        const directRes = await fetch(cleanTargetUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (directRes.ok) {
          const m3u8Text = await directRes.text();
          const baseUrl = new URL(cleanTargetUrl);
          const rewritten = m3u8Text.split('\n').map(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const absUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, baseUrl).toString();
              return `/api/proxy-4k?url=${encodeURIComponent(absUrl)}`;
            }
            return line;
          }).join('\n');

          c.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
          c.header('Access-Control-Allow-Origin', '*');
          return c.text(rewritten);
        }
      } catch (_) {}
    }

    const finalUrl = `/api/proxy-4k?url=${encodeURIComponent(cleanTargetUrl)}`;
    return c.redirect(finalUrl, 302);
  }

  // 4. Resolve Aniboom stream if not in cache
  try {
    if (!rawStreamUrl) {
      let referer = 'https://animego.me/';
      const parentMatch = cleanTargetUrl.match(/[?&]parent=([^&]+)/i);
      if (parentMatch) {
        const decodedParent = safeUnescapeUrl(parentMatch[1]);
        if (decodedParent.startsWith('http://') || decodedParent.startsWith('https://')) {
          referer = decodedParent;
        }
      }

      let parsedTargetUrl: URL;
      try {
        parsedTargetUrl = new URL(cleanTargetUrl.startsWith('//') ? `https:${cleanTargetUrl}` : cleanTargetUrl);
      } catch (_) {
        parsedTargetUrl = new URL('https://aniboom.one');
      }

      if (!parsedTargetUrl.searchParams.has('parent')) {
        parsedTargetUrl.searchParams.set('parent', referer);
      }

      const existingTranslation = parsedTargetUrl.searchParams.get('translation');
      // Try existing translation first, then fallback to default '' and common IDs
      const translationCandidates = existingTranslation 
        ? Array.from(new Set([existingTranslation, '', '16', '24', '1', '2', '3']))
        : ['', '16', '24', '1', '2', '3'];

      const originalParent = parsedTargetUrl.searchParams.get('parent') || referer;
      const originHost = originalParent.startsWith('http') ? new URL(originalParent).origin : 'https://animego.me';

      const candidateReferers = [
        originalParent,
        referer,
        'https://animego.me/',
        'https://animego.org/',
        'https://aniboom.one/'
      ];

      console.log(`🌐 [Aniboom Fetch]: ${parsedTargetUrl.toString()} | Referer: ${originalParent}`);

      let response: any = null;
      let lastFetchErr: any = null;

      outerLoop:
      for (const tr of translationCandidates) {
        for (const ref of candidateReferers) {
          try {
            const currentOrigin = ref.startsWith('http') ? new URL(ref).origin : originHost;
            const fetchUrlObj = new URL(parsedTargetUrl.toString());
            if (tr) {
              fetchUrlObj.searchParams.set('translation', tr);
            } else {
              fetchUrlObj.searchParams.delete('translation');
            }
            if (!fetchUrlObj.searchParams.has('parent')) {
              fetchUrlObj.searchParams.set('parent', ref);
            }

            console.log(`[Aniboom Attempt]: URL=${fetchUrlObj.toString()} | Ref=${ref} | Origin=${currentOrigin}`);
            response = await axios.get(fetchUrlObj.toString(), {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': ref,
                'Origin': currentOrigin,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Fetch-Dest': 'iframe',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site'
              },
              timeout: 10000
            });
            console.log(`[Aniboom Response]: Status=${response?.status}, DataLength=${response?.data?.length || 0}`);
            if (response && response.status === 200 && response.data && (response.data.includes('data-parameters') || response.data.includes('id="video"'))) {
              break outerLoop;
            }
          } catch (err: any) {
            if (err.response?.status !== 404) {
              console.debug(`[Aniboom Attempt]: ${err.message} (${err.response?.status})`);
            }
            lastFetchErr = err;
          }
        }
      }

      if (!response || !response.data) {
        throw new Error(`Aniboom embed request failed: ${lastFetchErr?.message || 'Empty response'}`);
      }

      const $ = cheerio.load(response.data);
      let rawParams = $('#video, [data-parameters], div[data-parameters]').attr('data-parameters');

      if (!rawParams) {
        const match = typeof response.data === 'string'
          ? (response.data.match(/data-parameters="([^"]+)"/) || response.data.match(/data-parameters='([^']+)'/))
          : null;
        if (match) rawParams = match[1];
      }

      if (!rawParams) {
        throw new Error('data-parameters container not found in Aniboom embed');
      }

      const params = safeParseParams(rawParams);

      // Handle double serialized strings for hls & dash
      let hlsData = params.hls;
      if (typeof hlsData === 'string') {
        try {
          hlsData = JSON.parse(hlsData);
        } catch (_) {}
      }

      let dashData = params.dash;
      if (typeof dashData === 'string') {
        try {
          dashData = JSON.parse(dashData);
        } catch (_) {}
      }

      // Extract raw direct link
      if (typeof hlsData === 'object' && hlsData !== null) {
        rawStreamUrl = hlsData['1080'] || hlsData['720'] || hlsData['480'] || hlsData['360'] || hlsData.src || hlsData.url || hlsData.file || '';
      } else if (typeof hlsData === 'string') {
        rawStreamUrl = hlsData;
      }

      if (!rawStreamUrl) {
        if (typeof dashData === 'object' && dashData !== null) {
          rawStreamUrl = dashData['1080'] || dashData['720'] || dashData['480'] || dashData['360'] || dashData.src || dashData.url || dashData.file || '';
        } else if (typeof dashData === 'string') {
          rawStreamUrl = dashData;
        }
      }

      if (!rawStreamUrl) {
        throw new Error('Direct video source URL not found in data-parameters');
      }

      if (rawStreamUrl.startsWith('//')) {
        rawStreamUrl = 'https:' + rawStreamUrl;
      }

      // CDN2 Handshake for AniBoom session authorization
      try {
        const videoHash = params?.id || params?.hash || (rawStreamUrl.match(/\/([a-f0-9]{32,64})/i)?.[1]);
        const cdn2Url = videoHash ? `https://aniboom.one/cdn2/${videoHash}` : 'https://aniboom.one/';
        await axios.post(cdn2Url, {}, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': parsedTargetUrl.toString(),
            'Origin': 'https://aniboom.one'
          },
          timeout: 3000
        }).catch(() => {});
      } catch (_) {}

      finalStreamUrl = `/api/proxy-4k?url=${encodeURIComponent(rawStreamUrl)}&referer=${encodeURIComponent('https://aniboom.one/')}`;
      playlistCache.set(cleanTargetUrl, { streamUrl: finalStreamUrl, rawUrl: rawStreamUrl, exp: now + 4 * 3600 * 1000 });
      console.log(`✅ [Aniboom Stream Resolved]: ${rawStreamUrl}`);
    }

    // Handle resolve=true for Download Widgets
    if (resolveOnly) {
      return c.json({
        success: true,
        streamType: 'hls',
        qualities: [1080, 720, 480, 360],
        quality: 1080,
        direct_url: rawStreamUrl,
        url: finalStreamUrl
      });
    }

    // Handle specific quality download playlist rewrite (1080p, 720p, etc.)
    if (requestedQuality) {
      try {
        console.log(`📥 [Aniboom Quality Playlist]: Fetching ${requestedQuality}p variant for ${rawStreamUrl}`);
        const masterRes = await axios.get(rawStreamUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://aniboom.one/',
            'Origin': 'https://aniboom.one'
          },
          timeout: 10000
        });

        const masterText = typeof masterRes.data === 'string' ? masterRes.data : String(masterRes.data);
        const masterBaseUrl = new URL(rawStreamUrl);

        let variantUrl = rawStreamUrl;

        // If master playlist with multiple variant streams, find the requested resolution
        if (masterText.includes('#EXT-X-STREAM-INF')) {
          const lines = masterText.split('\n');
          let bestVariantLine = '';
          let matchedVariantLine = '';

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF')) {
              const nextLine = (lines[i + 1] || '').trim();
              if (nextLine && !nextLine.startsWith('#')) {
                if (!bestVariantLine) bestVariantLine = nextLine; // First is usually 1080p
                if (line.includes(`RESOLUTION=`) && (line.includes(`x${requestedQuality}`) || line.includes(`${requestedQuality}`))) {
                  matchedVariantLine = nextLine;
                  break;
                }
              }
            }
          }

          const chosenLine = matchedVariantLine || bestVariantLine;
          if (chosenLine) {
            variantUrl = chosenLine.startsWith('http') ? chosenLine : new URL(chosenLine, masterBaseUrl).toString();
          }
        }

        // Fetch the variant playlist with segments
        const variantRes = await axios.get(variantUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://aniboom.one/',
            'Origin': 'https://aniboom.one'
          },
          timeout: 10000
        });

        const variantText = typeof variantRes.data === 'string' ? variantRes.data : String(variantRes.data);
        const variantBaseUrl = new URL(variantUrl);

        // Rewrite each segment to go through the proxy with Aniboom referer
        const rewrittenVariant = variantText.split('\n').map(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const absSegUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, variantBaseUrl).toString();
            return `/api/proxy-4k?url=${encodeURIComponent(absSegUrl)}&referer=${encodeURIComponent('https://aniboom.one/')}`;
          }
          return line;
        }).join('\n');

        c.header('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        c.header('Access-Control-Allow-Origin', '*');
        return c.text(rewrittenVariant);
      } catch (err: any) {
        console.debug(`[Aniboom Quality Playlist Notice]: ${err.message}. Serving master stream redirect.`);
        return c.redirect(finalStreamUrl, 302);
      }
    }

    // Direct streaming redirect
    c.header('X-Stream-Provider', 'aniboom');
    return c.redirect(finalStreamUrl, 302);

  } catch (err: any) {
    const activeFallback = cleanFallbackUrl || fallbackUrl;
    if (activeFallback) {
      console.log(`[Playlist Resolver] Switching to Kodik fallback: ${activeFallback}`);
      try {
        const kodikResult = await extractKodikStream(activeFallback, requestedQuality, resolveOnly, c);
        c.header('X-Stream-Provider', 'kodik');
        if (kodikResult.type === 'json') {
          return c.json({ ...kodikResult.data, provider: 'kodik' });
        }
        if (kodikResult.type === 'redirect') {
          return c.redirect(kodikResult.url, 302);
        }
        c.header('Content-Type', kodikResult.contentType);
        c.header('Access-Control-Allow-Origin', '*');
        return c.text(kodikResult.data);
      } catch (fErr: any) {
        console.warn(`[Kodik Fallback Failed]: ${fErr.message}`);
      }
    }

    console.warn(`[Playlist Resolver Error]: ${err.message}. Returning 502.`);
    return c.json({
      error: 'aniboom_stream_unavailable',
      fallback_url: activeFallback || '',
      message: err.message
    }, 502);
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

// Serve all static files from ./dist and ./public directories
app.use('/*', serveStatic({ root: './dist' }));
app.use('/*', serveStatic({ root: './public' }));

// Never serve HTML for missing static files (scripts, styles, images, assets) - return 404 with correct MIME type
app.get('/*', async (c) => {
  const reqPath = c.req.path;
  
  // If request is for an asset, script, or contains a file extension, return 404 with exact MIME
  if (
    reqPath.startsWith('/assets/') ||
    /\.(js|mjs|cjs|ts|tsx|jsx|css|map|wasm|png|jpg|jpeg|gif|svg|ico|webp|json|woff|woff2|ttf|eot|xml|txt)$/i.test(reqPath)
  ) {
    const cleanPath = reqPath.split('?')[0].toLowerCase();
    let contentType = 'text/plain; charset=utf-8';
    if (cleanPath.endsWith('.css')) {
      contentType = 'text/css; charset=utf-8';
    } else if (/\.(js|mjs|cjs)$/i.test(cleanPath)) {
      contentType = 'application/javascript; charset=utf-8';
    } else if (/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(cleanPath)) {
      contentType = 'image/png';
    } else if (/\.(woff|woff2|ttf|eot)$/i.test(cleanPath)) {
      contentType = 'font/woff2';
    } else if (cleanPath.endsWith('.json')) {
      contentType = 'application/json; charset=utf-8';
    }

    return new Response('/* Asset Not Found */', {
      status: 404,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }

  // SPA Fallback for HTML navigation routes
  const distIndexPath = path.join(process.cwd(), 'dist', 'index.html');
  const rootIndexPath = path.join(process.cwd(), 'index.html');

  if (fs.existsSync(distIndexPath)) {
    const html = await fs.promises.readFile(distIndexPath, 'utf-8');
    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    c.header('Surrogate-Control', 'no-store');
    return c.html(html);
  } else if (fs.existsSync(rootIndexPath)) {
    const html = await fs.promises.readFile(rootIndexPath, 'utf-8');
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
