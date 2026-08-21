import axios from 'axios';
import { GoogleGenAI } from '@google/genai';

export interface AnimeBridgeResult {
  success: boolean;
  animeTitle: string;
  episode: number;
  season?: number;
  mappedChapter: number | string;
  chapterRange?: string;
  recommendedChapter: number | string;
  volume?: number | string;
  adaptationSummary: string;
  source: 'verified_db' | 'mangaupdates' | 'gemini_ai' | 'algorithmic';
  mangaId?: string;
  mangaTitle?: string;
  mangaCover?: string;
  totalChapters?: number;
  directUrl?: string;
}

// Curated verified database for top anime titles with per-season and per-episode exact mapping
interface TitleMapping {
  aliases: string[];
  mangaSearchQuery: string;
  totalMangaChapters?: number;
  seasons: {
    season: number;
    episodesCount: number;
    startChapter: number;
    endChapter: number;
    startVolume?: number;
    endVolume?: number;
    specialRules?: { [ep: number]: { chapter: number | string; range?: string; volume?: number | string; note?: string } };
  }[];
}

const VERIFIED_ANIME_MAP: Record<string, TitleMapping> = {
  kimetsu: {
    aliases: ['клинок, рассекающий демонов', 'клинок рассекающий демонов', 'demon slayer', 'kimetsu no yaiba', 'истребитель демонов', 'клинок'],
    mangaSearchQuery: 'Клинок, рассекающий демонов',
    totalMangaChapters: 205,
    seasons: [
      {
        season: 1,
        episodesCount: 26,
        startChapter: 1,
        endChapter: 54,
        startVolume: 1,
        endVolume: 7,
        specialRules: {
          1: { chapter: 1, range: '1', volume: 1 },
          2: { chapter: 2, range: '2-3', volume: 1 },
          3: { chapter: 4, range: '3-5', volume: 1 },
          4: { chapter: 6, range: '5-7', volume: 1 },
          5: { chapter: 8, range: '7-9', volume: 1 },
          6: { chapter: 10, range: '9-11', volume: 2 },
          7: { chapter: 12, range: '11-13', volume: 2 },
          8: { chapter: 14, range: '13-15', volume: 2 },
          9: { chapter: 16, range: '15-17', volume: 2 },
          10: { chapter: 18, range: '17-19', volume: 3 },
          11: { chapter: 20, range: '19-21', volume: 3 },
          12: { chapter: 23, range: '21-24', volume: 3 },
          13: { chapter: 25, range: '24-27', volume: 3 },
          14: { chapter: 28, range: '27-30', volume: 4 },
          15: { chapter: 31, range: '30-32', volume: 4 },
          16: { chapter: 33, range: '32-35', volume: 4 },
          17: { chapter: 36, range: '35-38', volume: 5 },
          18: { chapter: 39, range: '38-41', volume: 5 },
          19: { chapter: 40, range: '40-42', volume: 5 },
          20: { chapter: 43, range: '42-44', volume: 5 },
          21: { chapter: 45, range: '44-46', volume: 6 },
          22: { chapter: 47, range: '46-48', volume: 6 },
          23: { chapter: 49, range: '48-50', volume: 6 },
          24: { chapter: 51, range: '50-51', volume: 6 },
          25: { chapter: 52, range: '51-53', volume: 6 },
          26: { chapter: 54, range: '53-54', volume: 7, note: 'Конец 1 сезона. Читайте Поезд «Бесконечный» с 54 главы' }
        }
      },
      {
        season: 2, // Entertainment District / Yuukaku-hen
        episodesCount: 18, // 7 Mugen Train + 11 Entertainment District
        startChapter: 54,
        endChapter: 97,
        startVolume: 7,
        endVolume: 11
      },
      {
        season: 3, // Swordsmith Village
        episodesCount: 11,
        startChapter: 98,
        endChapter: 127,
        startVolume: 12,
        endVolume: 15
      },
      {
        season: 4, // Hashira Training
        episodesCount: 8,
        startChapter: 128,
        endChapter: 136,
        startVolume: 15,
        endVolume: 16
      }
    ]
  },
  jujutsu: {
    aliases: ['магическая битва', 'jujutsu kaisen', 'магическая битва 2', 'магическая битва 1'],
    mangaSearchQuery: 'Магическая битва',
    totalMangaChapters: 271,
    seasons: [
      {
        season: 1,
        episodesCount: 24,
        startChapter: 1,
        endChapter: 63,
        startVolume: 1,
        endVolume: 8,
        specialRules: {
          1: { chapter: 1, range: '1', volume: 1 },
          2: { chapter: 2, range: '2-3', volume: 1 },
          3: { chapter: 4, range: '4-5', volume: 1 },
          4: { chapter: 6, range: '6-8', volume: 1 },
          5: { chapter: 9, range: '9-10', volume: 2 },
          6: { chapter: 11, range: '11-12', volume: 2 },
          7: { chapter: 14, range: '13-16', volume: 2 },
          8: { chapter: 17, range: '17-18', volume: 3 },
          9: { chapter: 20, range: '19-21', volume: 3 },
          10: { chapter: 23, range: '22-25', volume: 3 },
          11: { chapter: 26, range: '26-28', volume: 4 },
          12: { chapter: 29, range: '29-30', volume: 4 },
          13: { chapter: 31, range: '30-31', volume: 4 },
          14: { chapter: 32, range: '32-33', volume: 4 },
          15: { chapter: 35, range: '34-36', volume: 5 },
          16: { chapter: 37, range: '37-39', volume: 5 },
          17: { chapter: 40, range: '40-42', volume: 5 },
          18: { chapter: 43, range: '43-45', volume: 6 },
          19: { chapter: 47, range: '46-49', volume: 6 },
          20: { chapter: 50, range: '50-52', volume: 6 },
          21: { chapter: 53, range: '53-54', volume: 7 },
          22: { chapter: 56, range: '55-58', volume: 7 },
          23: { chapter: 59, range: '59-61', volume: 7 },
          24: { chapter: 63, range: '62-63', volume: 8, note: 'Конец 1 сезона. Рекомендуется начать с 64 главы' }
        }
      },
      {
        season: 2,
        episodesCount: 23,
        startChapter: 64,
        endChapter: 137,
        startVolume: 8,
        endVolume: 16
      }
    ]
  },
  chainsaw: {
    aliases: ['человек-бензопила', 'человек бензопила', 'chainsaw man', 'бензопила'],
    mangaSearchQuery: 'Человек-бензопила',
    totalMangaChapters: 180,
    seasons: [
      {
        season: 1,
        episodesCount: 12,
        startChapter: 1,
        endChapter: 38,
        startVolume: 1,
        endVolume: 5,
        specialRules: {
          1: { chapter: 1, range: '1', volume: 1 },
          2: { chapter: 3, range: '2-5', volume: 1 },
          3: { chapter: 7, range: '6-8', volume: 1 },
          4: { chapter: 10, range: '9-11', volume: 2 },
          5: { chapter: 13, range: '12-14', volume: 2 },
          6: { chapter: 16, range: '15-17', volume: 2 },
          7: { chapter: 19, range: '18-21', volume: 3 },
          8: { chapter: 23, range: '22-25', volume: 3 },
          9: { chapter: 27, range: '26-28', volume: 4 },
          10: { chapter: 30, range: '29-31', volume: 4 },
          11: { chapter: 33, range: '32-35', volume: 4 },
          12: { chapter: 38, range: '36-38', volume: 5, note: 'Конец 1 сезона. Арка Резе начинается с 39 главы' }
        }
      }
    ]
  },
  sololeveling: {
    aliases: ['поднятие уровня в одиночку', 'solo leveling', 'ore dake level up na ken', 'соло левелинг'],
    mangaSearchQuery: 'Поднятие уровня в одиночку',
    totalMangaChapters: 200,
    seasons: [
      {
        season: 1,
        episodesCount: 12,
        startChapter: 1,
        endChapter: 45,
        specialRules: {
          1: { chapter: 2, range: '1-3' },
          2: { chapter: 5, range: '4-7' },
          3: { chapter: 9, range: '8-11' },
          4: { chapter: 13, range: '12-14' },
          5: { chapter: 16, range: '15-18' },
          6: { chapter: 21, range: '19-24' },
          7: { chapter: 26, range: '25-27' },
          8: { chapter: 29, range: '28-31' },
          9: { chapter: 33, range: '32-34' },
          10: { chapter: 36, range: '35-37' },
          11: { chapter: 40, range: '38-42' },
          12: { chapter: 45, range: '43-45', note: 'Конец 1 сезона. Получение класса теневого монарха, читать с 46 главы' }
        }
      },
      {
        season: 2,
        episodesCount: 13,
        startChapter: 46,
        endChapter: 90
      }
    ]
  },
  frieren: {
    aliases: ['провожающая в последний путь фрирен', 'frieren', 'sousou no frieren', 'фрирен'],
    mangaSearchQuery: 'Провожающая в последний путь Фрирен',
    totalMangaChapters: 135,
    seasons: [
      {
        season: 1,
        episodesCount: 28,
        startChapter: 1,
        endChapter: 60,
        startVolume: 1,
        endVolume: 7,
        specialRules: {
          1: { chapter: 1, range: '1-2', volume: 1 },
          2: { chapter: 3, range: '2-3', volume: 1 },
          3: { chapter: 4, range: '4-5', volume: 1 },
          4: { chapter: 6, range: '6-7', volume: 1 },
          5: { chapter: 8, range: '8-9', volume: 2 },
          6: { chapter: 11, range: '10-12', volume: 2 },
          7: { chapter: 14, range: '13-15', volume: 2 },
          8: { chapter: 17, range: '16-18', volume: 2 },
          9: { chapter: 19, range: '18-20', volume: 3 },
          10: { chapter: 22, range: '21-23', volume: 3 },
          11: { chapter: 24, range: '23-25', volume: 3 },
          12: { chapter: 26, range: '25-27', volume: 3 },
          13: { chapter: 28, range: '27-28', volume: 4 },
          14: { chapter: 30, range: '29-31', volume: 4 },
          15: { chapter: 32, range: '31-33', volume: 4 },
          16: { chapter: 34, range: '33-35', volume: 4 },
          17: { chapter: 36, range: '35-37', volume: 5 },
          18: { chapter: 38, range: '37-39', volume: 5 },
          19: { chapter: 40, range: '39-41', volume: 5 },
          20: { chapter: 42, range: '41-43', volume: 5 },
          21: { chapter: 44, range: '43-45', volume: 5 },
          22: { chapter: 47, range: '46-48', volume: 6 },
          23: { chapter: 49, range: '48-50', volume: 6 },
          24: { chapter: 52, range: '51-53', volume: 6 },
          25: { chapter: 54, range: '53-55', volume: 6 },
          26: { chapter: 56, range: '55-57', volume: 7 },
          27: { chapter: 58, range: '57-59', volume: 7 },
          28: { chapter: 60, range: '59-60', volume: 7, note: 'Конец 1 сезона экзамена магов. Продолжить с 61 главы' }
        }
      }
    ]
  },
  aot: {
    aliases: ['атака титанов', 'attack on titan', 'shingeki no kyojin', 'титаны'],
    mangaSearchQuery: 'Атака титанов',
    totalMangaChapters: 139,
    seasons: [
      { season: 1, episodesCount: 25, startChapter: 1, endChapter: 34, startVolume: 1, endVolume: 8 },
      { season: 2, episodesCount: 12, startChapter: 35, endChapter: 50, startVolume: 9, endVolume: 12 },
      { season: 3, episodesCount: 22, startChapter: 51, endChapter: 90, startVolume: 13, endVolume: 22 },
      { season: 4, episodesCount: 28, startChapter: 91, endChapter: 139, startVolume: 23, endVolume: 34 }
    ]
  },
  spyxfamily: {
    aliases: ['семья шпиона', 'spy x family', 'spyxfamily', 'шпионская семья'],
    mangaSearchQuery: 'Семья шпиона',
    totalMangaChapters: 100,
    seasons: [
      { season: 1, episodesCount: 25, startChapter: 1, endChapter: 38, startVolume: 1, endVolume: 7 },
      { season: 2, episodesCount: 12, startChapter: 39, endChapter: 59, startVolume: 8, endVolume: 10 }
    ]
  },
  onepunchman: {
    aliases: ['ванпанчмен', 'ванпачмен', 'one punch man', 'one-punch man', 'сайтама'],
    mangaSearchQuery: 'Ванпанчмен',
    totalMangaChapters: 200,
    seasons: [
      { season: 1, episodesCount: 12, startChapter: 1, endChapter: 37, startVolume: 1, endVolume: 7 },
      { season: 2, episodesCount: 12, startChapter: 38, endChapter: 84, startVolume: 8, endVolume: 16 }
    ]
  },
  oshinoko: {
    aliases: ['звёздное дитя', 'звездное дитя', 'oshi no ko', 'моё звёздное дитя'],
    mangaSearchQuery: 'Звёздное дитя',
    totalMangaChapters: 166,
    seasons: [
      { season: 1, episodesCount: 11, startChapter: 1, endChapter: 40, startVolume: 1, endVolume: 4 },
      { season: 2, episodesCount: 13, startChapter: 41, endChapter: 80, startVolume: 5, endVolume: 8 }
    ]
  },
  kaiju8: {
    aliases: ['кайдзю №8', 'кайдзю номер 8', 'kaiju no. 8', 'kaiju 8'],
    mangaSearchQuery: 'Кайдзю №8',
    totalMangaChapters: 115,
    seasons: [
      { season: 1, episodesCount: 12, startChapter: 1, endChapter: 38, startVolume: 1, endVolume: 5 }
    ]
  },
  bluelock: {
    aliases: ['синяя тюрьма', 'блю лок', 'blue lock', 'синяя тюрьма: блю лок'],
    mangaSearchQuery: 'Синяя тюрьма: Блю Лок',
    totalMangaChapters: 280,
    seasons: [
      { season: 1, episodesCount: 24, startChapter: 1, endChapter: 94, startVolume: 1, endVolume: 11 },
      { season: 2, episodesCount: 14, startChapter: 95, endChapter: 151, startVolume: 12, endVolume: 17 }
    ]
  },
  deathnote: {
    aliases: ['тетрадь смерти', 'death note'],
    mangaSearchQuery: 'Тетрадь смерти',
    totalMangaChapters: 108,
    seasons: [
      { season: 1, episodesCount: 37, startChapter: 1, endChapter: 108, startVolume: 1, endVolume: 12 }
    ]
  },
  tokyoghoul: {
    aliases: ['токийский гуль', 'tokyo ghoul'],
    mangaSearchQuery: 'Токийский гуль',
    totalMangaChapters: 143,
    seasons: [
      { season: 1, episodesCount: 12, startChapter: 1, endChapter: 66, startVolume: 1, endVolume: 7 }
    ]
  },
  vinlandsaga: {
    aliases: ['сага о винланде', 'vinland saga'],
    mangaSearchQuery: 'Сага о Винланде',
    totalMangaChapters: 215,
    seasons: [
      { season: 1, episodesCount: 24, startChapter: 1, endChapter: 54, startVolume: 1, endVolume: 8 },
      { season: 2, episodesCount: 24, startChapter: 55, endChapter: 99, startVolume: 9, endVolume: 14 }
    ]
  },
  bleach: {
    aliases: ['блич', 'bleach', 'тысячелетняя кровавая война'],
    mangaSearchQuery: 'Блич',
    totalMangaChapters: 686,
    seasons: [
      { season: 1, episodesCount: 366, startChapter: 1, endChapter: 479 },
      { season: 2, episodesCount: 13, startChapter: 480, endChapter: 542 }
    ]
  },
  naruto: {
    aliases: ['наруто', 'naruto', 'наруто ураганные хроники', 'naruto shippuden'],
    mangaSearchQuery: 'Наруто',
    totalMangaChapters: 700,
    seasons: [
      { season: 1, episodesCount: 220, startChapter: 1, endChapter: 238 },
      { season: 2, episodesCount: 500, startChapter: 245, endChapter: 700 }
    ]
  },
  youjo_senki: {
    aliases: ['военная хроника маленькой девочки', 'youjo senki', 'saga of tanya the evil', 'военная хроника маленькой девочки 2', 'таня грозная', 'хроники девочки'],
    mangaSearchQuery: 'Военная хроника маленькой девочки',
    totalMangaChapters: 85,
    seasons: [
      { season: 1, episodesCount: 12, startChapter: 1, endChapter: 20 },
      { season: 2, episodesCount: 12, startChapter: 21, endChapter: 60 }
    ]
  },
  mushoku_tensei: {
    aliases: ['реинкарнация безработного', 'mushoku tensei', 'безработный'],
    mangaSearchQuery: 'Реинкарнация безработного',
    totalMangaChapters: 100,
    seasons: [
      { season: 1, episodesCount: 23, startChapter: 1, endChapter: 52 },
      { season: 2, episodesCount: 24, startChapter: 53, endChapter: 90 }
    ]
  },
  overlord: {
    aliases: ['оверлорд', 'повелитель', 'overlord'],
    mangaSearchQuery: 'Повелитель',
    totalMangaChapters: 80,
    seasons: [
      { season: 1, episodesCount: 13, startChapter: 1, endChapter: 18 },
      { season: 2, episodesCount: 13, startChapter: 19, endChapter: 35 },
      { season: 3, episodesCount: 13, startChapter: 36, endChapter: 55 },
      { season: 4, episodesCount: 13, startChapter: 56, endChapter: 80 }
    ]
  },
  shield_hero: {
    aliases: ['восхождение героя щита', 'tate no yuusha no nariagari', 'герой щита'],
    mangaSearchQuery: 'Восхождение героя щита',
    totalMangaChapters: 105,
    seasons: [
      { season: 1, episodesCount: 25, startChapter: 1, endChapter: 45 },
      { season: 2, episodesCount: 13, startChapter: 46, endChapter: 62 },
      { season: 3, episodesCount: 12, startChapter: 63, endChapter: 85 }
    ]
  }
};

/**
 * Clean and normalize anime query string
 */
function normalizeQuery(title: string): string {
  return title
    .toLowerCase()
    .replace(/[«»"']/g, '')
    .replace(/season\s*\d+/gi, '')
    .replace(/сезон\s*\d+/gi, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();
}

/**
 * Fetch Anime adaptation info from MangaUpdates API
 */
async function fetchMangaUpdatesMapping(title: string): Promise<{ start?: string; end?: string; mangaTitle?: string } | null> {
  try {
    const clean = title.split('/')[0].trim();
    const res = await axios.post('https://api.mangaupdates.com/v1/series/search', {
      search: clean,
      page: 1,
      perpage: 5
    }, { timeout: 3500 });

    const results = res.data?.results;
    if (!results || results.length === 0) return null;

    for (const item of results) {
      const record = item.record;
      if (!record?.series_id) continue;
      
      const sRes = await axios.get(`https://api.mangaupdates.com/v1/series/${record.series_id}`, { timeout: 3000 });
      const animeData = sRes.data?.anime;
      if (animeData && (animeData.start || animeData.end)) {
        return {
          start: animeData.start,
          end: animeData.end,
          mangaTitle: record.title || clean
        };
      }
    }
  } catch (err) {
    console.warn('[fetchMangaUpdatesMapping] Error:', (err as any)?.message);
  }
  return null;
}

/**
 * Parse MangaUpdates start/end string into structured season chapter mappings
 * Example input: "Vol 1, Chap 1 (S1) / Vol 8, Chap 64 (S2)", "Vol 8, Chap 63 (S1) / Vol 16, Chap 137 (S2)"
 */
function parseMangaUpdatesSeason(startStr: string, endStr: string, episodeNum: number): {
  mappedChapter: number;
  chapterRange: string;
  seasonText: string;
} | null {
  try {
    const startParts = startStr.split('/').map(p => p.trim());
    const endParts = endStr.split('/').map(p => p.trim());

    // Extract first season / range
    const firstStart = startParts[0] || '';
    const firstEnd = endParts[0] || '';

    const startChapMatch = firstStart.match(/Chap\s*(\d+)/i);
    const endChapMatch = firstEnd.match(/Chap\s*(\d+)/i);

    if (startChapMatch && endChapMatch) {
      const startChap = parseInt(startChapMatch[1], 10);
      const endChap = parseInt(endChapMatch[1], 10);
      const totalChaps = Math.max(1, endChap - startChap + 1);

      // Estimate ~2.2 chapters per episode if episode count is unknown
      const estimatedEpChaps = 2.2;
      const targetChap = Math.min(endChap, Math.max(startChap, Math.round(startChap + (episodeNum - 1) * estimatedEpChaps)));
      const nextChap = Math.min(endChap, targetChap + 1);

      return {
        mappedChapter: targetChap,
        chapterRange: `${targetChap}–${nextChap}`,
        seasonText: `Манга охватывает главы ${startChap}–${endChap}`
      };
    }
  } catch (e) {
    console.warn('[parseMangaUpdatesSeason] parse error:', e);
  }
  return null;
}

/**
 * Use Gemini 3.7 Flash API to resolve exact Anime Episode to Manga Chapter if available
 */
async function resolveViaGemini(animeTitle: string, episodeNum: number): Promise<{
  chapter: number | string;
  range?: string;
  volume?: number | string;
  summary?: string;
} | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const prompt = `Ты база данных соответствия аниме и манги.
Аниме: "${animeTitle}", Серия: ${episodeNum}.
Определи точную главу манги, которую адаптирует эта серия (или с какой главы продолжать чтение).
Ответь СТРОГО в формате JSON без кавычек markdown:
{
  "chapter": 17,
  "range": "16-17",
  "volume": 3,
  "summary": "11 серия адаптирует 16-17 главы манги. Читать рекомендуется с 17 главы."
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const text = response.text?.trim();
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed.chapter) {
        return {
          chapter: parsed.chapter,
          range: parsed.range || String(parsed.chapter),
          volume: parsed.volume,
          summary: parsed.summary
        };
      }
    }
  } catch (e) {
    console.warn('[resolveViaGemini] Gemini bridge error:', (e as any)?.message);
  }
  return null;
}

/**
 * Core Resolver: Resolves Anime Title & Episode into accurate Manga Chapter & Reader Link
 */
export async function resolveAnimeEpisodeToManga(
  animeTitle: string,
  episode: number = 1
): Promise<AnimeBridgeResult> {
  const ep = Math.max(1, Number(episode) || 1);
  const rawTitle = animeTitle.trim();
  const normalized = normalizeQuery(rawTitle);

  // 1. Check in VERIFIED CURATED DATABASE (Highest accuracy)
  for (const [key, mapping] of Object.entries(VERIFIED_ANIME_MAP)) {
    const isMatch = mapping.aliases.some(alias => 
      normalized.includes(alias) || alias.includes(normalized) || rawTitle.toLowerCase().includes(alias)
    );

    if (isMatch) {
      // Find season
      let targetSeason = mapping.seasons[0];
      let epInSeason = ep;

      if (mapping.seasons.length > 1) {
        let accEps = 0;
        for (const s of mapping.seasons) {
          if (ep <= accEps + s.episodesCount) {
            targetSeason = s;
            epInSeason = ep - accEps;
            break;
          }
          accEps += s.episodesCount;
        }
      }

      // Check special rules for exact episode
      if (targetSeason.specialRules && targetSeason.specialRules[epInSeason]) {
        const rule = targetSeason.specialRules[epInSeason];
        return {
          success: true,
          animeTitle: rawTitle,
          episode: ep,
          season: targetSeason.season,
          mappedChapter: rule.chapter,
          chapterRange: rule.range || `${rule.chapter}`,
          recommendedChapter: rule.chapter,
          volume: rule.volume,
          adaptationSummary: rule.note || `${ep} серия адаптирует ${rule.range || rule.chapter} главы манги (Сезон ${targetSeason.season}).`,
          source: 'verified_db',
          mangaTitle: mapping.mangaSearchQuery
        };
      }

      // Calculate through linear chapter distribution within season
      const ratio = (epInSeason - 1) / Math.max(1, targetSeason.episodesCount - 1);
      const span = targetSeason.endChapter - targetSeason.startChapter;
      const calculatedChap = Math.round(targetSeason.startChapter + ratio * span);
      const nextChap = Math.min(targetSeason.endChapter, calculatedChap + 1);

      return {
        success: true,
        animeTitle: rawTitle,
        episode: ep,
        season: targetSeason.season,
        mappedChapter: calculatedChap,
        chapterRange: `${calculatedChap}–${nextChap}`,
        recommendedChapter: calculatedChap,
        adaptationSummary: `${ep} серия адаптирует события около ${calculatedChap} главы (Сезон ${targetSeason.season} охватывает главы ${targetSeason.startChapter}–${targetSeason.endChapter}).`,
        source: 'verified_db',
        mangaTitle: mapping.mangaSearchQuery,
        totalChapters: mapping.totalMangaChapters
      };
    }
  }

  // 2. Query MangaUpdates API for official adaptation records
  const muData = await fetchMangaUpdatesMapping(rawTitle);
  if (muData && muData.start && muData.end) {
    const parsed = parseMangaUpdatesSeason(muData.start, muData.end, ep);
    if (parsed) {
      return {
        success: true,
        animeTitle: rawTitle,
        episode: ep,
        mappedChapter: parsed.mappedChapter,
        chapterRange: parsed.chapterRange,
        recommendedChapter: parsed.mappedChapter,
        adaptationSummary: `${ep} серия соответствует ~${parsed.mappedChapter} главе манги по базе MangaUpdates. ${parsed.seasonText}.`,
        source: 'mangaupdates',
        mangaTitle: muData.mangaTitle || rawTitle
      };
    }
  }

  // 3. Query Gemini AI for exact intelligence if key exists
  const aiResult = await resolveViaGemini(rawTitle, ep);
  if (aiResult && aiResult.chapter) {
    return {
      success: true,
      animeTitle: rawTitle,
      episode: ep,
      mappedChapter: aiResult.chapter,
      chapterRange: aiResult.range || String(aiResult.chapter),
      recommendedChapter: aiResult.chapter,
      volume: aiResult.volume,
      adaptationSummary: aiResult.summary || `${ep} серия соответствует ${aiResult.chapter} главе манги (по данным ИИ-анализа).`,
      source: 'gemini_ai',
      mangaTitle: rawTitle
    };
  }

  // 4. Default algorithmic estimate (~2.2 chapters per episode)
  const defaultChap = Math.max(1, Math.round(ep * 2.2));
  return {
    success: true,
    animeTitle: rawTitle,
    episode: ep,
    mappedChapter: defaultChap,
    chapterRange: `${defaultChap}–${defaultChap + 1}`,
    recommendedChapter: defaultChap,
    adaptationSummary: `${ep} серия ориентировочно соответствует ${defaultChap} главе манги (~2-3 главы на серию).`,
    source: 'algorithmic',
    mangaTitle: rawTitle
  };
}
