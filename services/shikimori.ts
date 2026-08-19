
import { Anime, ScheduleItem, NewsItem } from '../types';
import { MOCK_ANIME, SCHEDULE, MOCK_NEWS, FALLBACK_IMAGE } from '../constants';
import { getFromStorage, saveToStorage } from './cache';
import { db } from './db';

const BASE_API = '/api/shikimori';
const IMG_BASE_URL = 'https://shikimori.one';
const PLACEHOLDER_IMAGE = FALLBACK_IMAGE;
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days default cache
const LONG_CACHE_TTL = 180 * 24 * 60 * 60 * 1000; // 180 days for static data (genres, descriptions, screenshots)

// Debug: Log the base API URL being used
console.log('[Shikimori Service] Initialized with BASE_API:', BASE_API);

// Concurrency Limiter
class RequestQueue {
  private queue: { task: () => void; priority: number }[] = [];
  private activeCount = 0;
  private maxConcurrent: number;
  private msDelay: number;
  private currentDelay: number;

  constructor(maxConcurrent: number, msDelay: number = 50) {
    this.maxConcurrent = maxConcurrent;
    this.msDelay = msDelay;
    this.currentDelay = msDelay;
  }

  async add<T>(fn: () => Promise<T>, priority: number = 0): Promise<T> {
    console.log(`[RequestQueue] Adding task with priority ${priority}. Queue length: ${this.queue.length}, Active: ${this.activeCount}`);
    return new Promise<T>((resolve, reject) => {
      const task = async () => {
        console.log(`[RequestQueue] Starting task. Active: ${this.activeCount}`);
        this.activeCount++;
        try {
          const result = await fn();
          // Reset delay on success
          this.currentDelay = this.msDelay;
          resolve(result);
        } catch (err: any) {
          if (err.name !== 'AbortError' && !err.message?.includes('aborted')) {
            console.error(`[RequestQueue] Task failed:`, err.message);
          }
          if (err.message && err.message.includes('Rate limit exceeded')) {
              // Increase delay on rate limit
              this.currentDelay = Math.min(this.currentDelay * 2, 10000);
          }
          reject(err);
        } finally {
          this.activeCount--;
          console.log(`[RequestQueue] Task finished. Active: ${this.activeCount}. Scheduling next in ${this.currentDelay}ms`);
          setTimeout(() => this.next(), this.currentDelay);
        }
      };

      if (this.activeCount < this.maxConcurrent) {
        task();
      } else {
        this.queue.push({ task, priority });
        // Sort by priority (higher number first)
        this.queue.sort((a, b) => b.priority - a.priority);
      }
    });
  }

  public clear() {
    this.queue = [];
  }

  private next() {
    if (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      item?.task();
    }
  }
}

const requestQueue = new RequestQueue(2, 350); // 2 concurrent, 350ms delay to respect 5 req/sec limit

let globalAbortController = new AbortController();

export const clearRequestQueue = () => {
  requestQueue.clear();
  globalAbortController.abort();
  globalAbortController = new AbortController();
};

const FETCH_TIMEOUT = 8000; // 8 seconds timeout

export const GENRE_MAP: Record<string, number> = {
  'Экшен': 1, 'Приключения': 2, 'Машины': 3, 'Комедия': 4, 'Безумие': 5,
  'Демоны': 6, 'Мистика': 7, 'Драма': 8, 'Этти': 9, 'Фэнтези': 10,
  'Игры': 11, 'Романтика': 22, 'Исторический': 13, 'Ужасы': 14, 'Детское': 15,
  'Магия': 16, 'Боевые искусства': 17, 'Меха': 18, 'Музыка': 19, 'Пародия': 20,
  'Самураи': 21, 'Шоджо': 25, 'Шоунен': 27, 'Школа': 23, 'Фантастика': 24,
  'Космос': 29, 'Спорт': 30, 'Супер сила': 31, 'Вампиры': 32, 'Гарем': 35,
  'Повседневность': 36, 'Сверхъестественное': 37, 'Военное': 38, 'Полиция': 39,
  'Психологическое': 40, 'Триллер': 41, 'Сейнен': 42, 'Джосей': 43,
  'Исэкай': 62, 'Работа': 541, 'Медицина': 8, 'Идолы': 19, 'Видеоигры': 11,
  'Выживание': 41,  'Реинкарнация': 10, 'Злодейка': 10, 'Городское фэнтези': 10,
  'CGDCT': 36, 'Антропоморфизм': 10, 'Взрослые персонажи': 42, 'Гонки': 3,
  'Гэг-юмор': 4, 'Жестокость': 14, 'Забота о детях': 36, 'Игра с высокими ставками': 11,
  'Идолы (Жен.)': 19, 'Идолы (Муж.)': 19, 'Изобразительное искусство': 36,
  'Исполнительское искусство': 19, 'Иясикэй': 36, 'Командный спорт': 30,
  'Кроссдрессинг': 4, 'Культура отаку': 4, 'Любовный многоугольник': 22,
  'Магическая смена пола': 74, 'Махо-сёдзё': 16, 'Мифология': 10,
  'Образовательное': 36, 'Организованная преступность': 39, 'Питомцы': 36,
  'Путешествие во времени': 24, 'Реверс-гарем': 35, 'Романтический подтекст': 22,
  'Спортивные единоборства': 17, 'Стратегические игры': 11,
  'Удостоено наград': 8, 'Хулиганы': 23, 'Шоу-бизнес': 8, 'Детектив': 7,
  'Сёдзе': 25, 'Сёнен': 27, 'Сэйнэн': 42, 'Дзёсей': 43, 'Сёдзе-ай': 26, 'Сёнен-ай': 28,
  'Яой': 33, 'Юри': 34, 'Смена пола': 74, 'Эротика': 539, 'Гурман': 543
};

const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-');  // Replace multiple - with single -
};

const proxyImage = (url: string | undefined | null) => {
  if (!url) return PLACEHOLDER_IMAGE;
  let cleanUrl = url.trim();
  
  // Force HTTPS
  cleanUrl = cleanUrl.replace('http://', 'https://');

  // Check for known Shikimori 404/missing images
  if (cleanUrl.includes('missing_original') || cleanUrl.includes('none.png') || cleanUrl.includes('missing')) {
      return PLACEHOLDER_IMAGE; 
  }

  // Convert absolute Shikimori URLs to relative proxy URLs
  if (cleanUrl.includes('shikimori.one')) {
    const path = cleanUrl.split('shikimori.one')[1];
    return `/api/image${path}`;
  }

  // Handle relative paths from Shikimori
  if (cleanUrl.startsWith('/')) {
    return `/api/image${cleanUrl}`;
  } else if (!cleanUrl.startsWith('http')) {
    return `/api/image/${cleanUrl}`;
  }
  
  return cleanUrl;
};

const processNewsHtml = (html: string | undefined): string => {
  if (!html) return '';
  
  // 1. Inject no-referrer to images to bypass hotlink protection (403 Forbidden)
  let processed = html.replace(
    /<img\s+([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, 
    (match, p1, src, p2) => {
        if (match.toLowerCase().includes('referrerpolicy')) return match;
        return `<img ${p1}src="${src}" referrerpolicy="no-referrer"${p2}>`;
    }
  );

  // 2. Convert Shikimori video blocks to YouTube embeds
  processed = processed.replace(
    /<div class=["']video-block["'][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>.*?<\/a>[\s\S]*?<\/div>/gi,
    (match, url) => {
        const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
        const ytMatch = url.match(ytRegex);
        
        if (ytMatch && ytMatch[1]) {
            const videoId = ytMatch[1];
            return `<div class="aspect-video w-full rounded-2xl overflow-hidden my-4 shadow-lg border border-white/10"><iframe src="https://www.youtube.com/embed/${videoId}" class="w-full h-full" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        return match;
    }
  );

  // 3. Fix relative links and add target="_blank"
  processed = processed.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (match, p1, href, p2) => {
        let fullHref = href;
        if (href.startsWith('/')) {
            fullHref = `https://shikimori.one${href}`;
        }
        if (match.toLowerCase().includes('target=')) {
            return `<a ${p1}href="${fullHref}"${p2}>`;
        }
        return `<a ${p1}href="${fullHref}" target="_blank" rel="noopener noreferrer"${p2}>`;
    }
  );

  return processed;
};

export const fetchApi = async (endpoint: string, retries = 2, bypassQueue = false, ttl = CACHE_TTL, priority = 0): Promise<any> => {
  // Check cache
  const cached = getFromStorage(`shikimori_v2_${endpoint}`);
  if (cached && (Date.now() - cached.timestamp < ttl)) {
    return cached.data;
  }

  // Define the network fetch task
  const networkTask = async (): Promise<any> => {
    const controller = new AbortController();
    let isTimeout = false;
    const timeoutId = setTimeout(() => {
        isTimeout = true;
        controller.abort();
    }, FETCH_TIMEOUT);
    
    // Listen to global abort to cancel this specific request
    const abortHandler = () => controller.abort();
    if (!bypassQueue) {
        globalAbortController.signal.addEventListener('abort', abortHandler);
    }

    try {
      const fetchUrl = `${BASE_API}${endpoint}`;
      console.log(`[Shikimori Service] Fetching: ${fetchUrl}`);
      const response = await fetch(fetchUrl, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!bypassQueue) {
          globalAbortController.signal.removeEventListener('abort', abortHandler);
      }

      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');

      if (!response.ok) {
        if (response.status === 404 || response.status === 422) {
            return []; // Return empty array instead of throwing error for 404 or 422
        }
        if (response.status === 429) {
             // If rate limited, wait longer
             const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
             throw new Error(`Rate limit exceeded:${retryAfter}`);
        }
        throw new Error(`API Error: ${response.status}`);
      }

      if (!isJson) {
         const text = await response.text();
         console.error(`[API Error] Expected JSON but got ${contentType}:`, text.slice(0, 100));
         throw new Error("API returned HTML instead of JSON. Check proxy configuration.");
      }

      const data = await response.json();
      saveToStorage(`shikimori_v2_${endpoint}`, data);
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // Retry logic for 429 or network errors
      if (retries > 0 && (error.message.includes('Rate limit exceeded') || error.name === 'AbortError' || error.message.includes('fetch'))) {
          // If aborted by global abort or local timeout, don't retry if it was an intentional abort
          if (error.name === 'AbortError' && !isTimeout) {
              throw error;
          }
          let delay = (4 - retries) * 2000; // Backoff: 2s, 4s
          
          if (error.message.includes('Rate limit exceeded')) {
              const parts = error.message.split(':');
              if (parts[1]) delay = (parseInt(parts[1]) + 1) * 1000;
              else delay = 5000; // Default 5s for 429
          }

          console.warn(`Retrying ${endpoint} in ${delay}ms... (${retries} left)`);
          await new Promise(r => setTimeout(r, delay));
          // Recursive call with decremented retries, bypassing queue to prioritize retry
          return fetchApi(endpoint, retries - 1, true, ttl, priority);
      }

      if (error.name !== 'AbortError' && !error.message?.includes('aborted')) {
        console.warn(`Fetch failed for ${endpoint}:`, error);
      }
      throw error;
    } finally {
      if (!bypassQueue) {
          globalAbortController.signal.removeEventListener('abort', abortHandler);
      }
    }
  };

  // Execute with queue or directly
  if (bypassQueue) {
    return networkTask().catch((err: any) => {
        return null;
    });
  }
  
  return requestQueue.add(networkTask, priority).catch((err: any) => {
      return null;
  });
};

export const mapAnime = async (data: any): Promise<Anime> => {
  if (!data) return {} as Anime;

  // Handle mock data structure pass-through
  if (data.id && data.title && data.description && (data.image || data.cover)) {
      return data as Anime;
  }
  
  const russian = data.russian || data.name || 'Без названия';
  
  let image = PLACEHOLDER_IMAGE;
  let image_preview = PLACEHOLDER_IMAGE;
  
  if (data.image) {
      if (typeof data.image === 'string') {
           if (!data.image.includes('missing')) {
               image = proxyImage(data.image);
               image_preview = image;
           }
      } else {
          // For main image (used in cards), prefer original over preview for better quality
          const candidates = [data.image.original, data.image.preview, data.image.x96];
          for (const img of candidates) {
              if (img && !img.includes('missing') && !img.includes('none.png')) {
                  image = proxyImage(img);
                  break;
              }
          }
          // If image is still placeholder, force it to the original URL so the proxy can fallback to Jikan
          if (image === PLACEHOLDER_IMAGE && data.id) {
              image = proxyImage(`/system/animes/original/${data.id}.jpg`);
          }

          // For preview (tiny), prefer x96
          const candidatesPreview = [data.image.x96, data.image.preview, data.image.original];
          for (const img of candidatesPreview) {
              if (img && !img.includes('missing') && !img.includes('none.png')) {
                  image_preview = proxyImage(img);
                  break;
              }
          }
          // If preview is still placeholder, force it to the original URL so the proxy can fallback to Jikan
          if (image_preview === PLACEHOLDER_IMAGE && data.id) {
              image_preview = proxyImage(`/system/animes/original/${data.id}.jpg`);
          }
      }
  }

  // Try to construct a high-res cover URL if we have an ID and it's from Shikimori
  let cover = image;
  if (data.id && (image.includes('shikimori') || (data.image && typeof data.image === 'object'))) {
      // Shikimori original images are often at /system/animes/original/{id}.jpg
      cover = proxyImage(`/system/animes/original/${data.id}.jpg`);
  }

  return {
    id: data.id?.toString() || '',
    slug: slugify(data.name || data.russian || ''),
    title: russian,
    originalName: data.name || '',
    image,
    image_preview,
    cover: cover,
    rating: data.score ? parseFloat(data.score) : 0,
    ageRating: data.rating || '',
    year: data.aired_on ? new Date(data.aired_on).getFullYear() : (data.released_on ? new Date(data.released_on).getFullYear() : 0),
    type: data.kind === 'movie' ? 'Movie' : (data.kind === 'ova' ? 'OVA' : (data.kind === 'ona' ? 'ONA' : 'TV Series')),
    genres: data.genres ? data.genres.map((g: any) => g.russian || g.name) : [],
    episodes: data.episodes || 0,
    episodesAired: data.episodes_aired || 0,
    status: data.status === 'anons' ? 'Upcoming' : (data.status === 'ongoing' ? 'Ongoing' : 'Completed'),
    description: (data.description || 'Описание отсутствует').replace(/\[.*?\]/g, '').trim(),
    studio: data.studios?.[0]?.name || 'Неизвестно',
    worldArtId: data.world_art_id?.toString(),
    kinopoiskId: data.kinopoisk_id?.toString(),
    imdbId: data.imdb_id?.toString()
  };
};

// Removed checkKodikAvailability import as it's no longer used

export const fetchAnimes = async (params: Record<string, any> = {}, bypassQueue = false, priority = 1): Promise<Anime[] & { hasMore?: boolean }> => {
  try {
    const cleanParams: any = { limit: params.limit || '50' }; // Fetch more to compensate for filtering
    if (!params.order) cleanParams.order = 'popularity';

    // Exclude Hentai (12), Erotica (539), Yaoi (33), Yuri (34), Shounen Ai (28), Shoujo Ai (26)
    const excludedGenres = '!12,!539,!33,!34,!28,!26';
    
    // Also exclude Rx rating
    cleanParams.rating = '!rx';

    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        if (k === 'genre') {
          // Handle multiple genres if passed as comma-separated string
          const genreIds = v.toString().split(',').map((g: string) => GENRE_MAP[g.trim()] || g.trim()).join(',');
          cleanParams[k] = `${genreIds},${excludedGenres}`;
        } else {
          cleanParams[k] = v;
        }
      }
    });
    
    if (!cleanParams.genre) {
        cleanParams.genre = excludedGenres;
    }

    // If we specifically want to remove order, we can pass order: 'none'
    if (cleanParams.order === 'none') {
        delete cleanParams.order;
    }

    const query = new URLSearchParams(cleanParams).toString();
    
    // Increased retries to 3
    // Use provided priority
    const data = await fetchApi(`/animes?${query}`, 3, bypassQueue, CACHE_TTL, priority);
    
    if (!data || (Array.isArray(data) && data.length === 0)) {
        const emptyResult = [] as any;
        emptyResult.hasMore = false;
        return emptyResult;
    }
    
    if (Array.isArray(data)) {
        // We removed checkKodikAvailability because the free token is blocked/invalid
        // and it was causing 500 errors and empty catalogs.
        // Now we just show all animes from Shikimori.
        const filteredData = data;
        
        const mappedAnimes = await Promise.all(filteredData.map(mapAnime));
        const result = mappedAnimes as any;
        // If the original data length was equal to the limit, there's probably more pages
        result.hasMore = data.length >= parseInt(cleanParams.limit);
        return result;
    }
    
    const emptyResult = [] as any;
    emptyResult.hasMore = false;
    return emptyResult;
  } catch (e) {
    // Suppress console error for empty results
    const emptyResult = [] as any;
    emptyResult.hasMore = false;
    return emptyResult;
  }
};

export const getAnimeById = async (id: string | number) => {
  if (!id) return null;
  try {
    // Priority 2 for details
    return await fetchApi(`/animes/${id}`, 2, false, LONG_CACHE_TTL, 2);
  } catch (e) {
    throw e;
  }
};

export const enrichAnimeWithKodik = async (anime: Anime, id: string, searchTitle?: string): Promise<Anime> => {
  const isMissingImage = (img: any): boolean => {
    if (!img) return true;
    if (typeof img === 'string') {
      return img === PLACEHOLDER_IMAGE || img.includes('missing') || img.includes('none.png');
    }
    if (typeof img === 'object') {
      const src = img.original || img.preview || '';
      return !src || (typeof src === 'string' && (src.includes('missing') || src.includes('none.png')));
    }
    return false;
  };

  const needsDescription = !anime.description || anime.description === 'Описание отсутствует' || anime.description.trim().length === 0;
  const needsGenres = !anime.genres || !Array.isArray(anime.genres) || anime.genres.length === 0;
  const needsImage = isMissingImage(anime.image);
  const needsCover = isMissingImage(anime.cover);

  if (!needsDescription && !needsGenres && !needsImage && !needsCover) {
    return anime;
  }

  try {
    let kodikUrl = `/api/media/search?shikimori_id=${id}`;
    let res = await fetch(kodikUrl);
    let data = res.ok ? await res.json() : null;

    if ((!data?.results || data.results.length === 0) && (searchTitle || anime.title)) {
      const q = (searchTitle || anime.title).split('/')[0].trim();
      res = await fetch(`/api/media/search?title=${encodeURIComponent(q)}`);
      data = res.ok ? await res.json() : null;
    }

    if (data?.results && data.results.length > 0) {
      const best = data.results.find((r: any) => r.material_data?.description || r.material_data?.anime_description) || data.results[0];
      const mat = best.material_data || {};

      // Description fallback from Kodik
      if (needsDescription) {
        const desc = mat.anime_description || mat.description || '';
        if (desc && desc.trim()) {
          anime.description = desc.replace(/\[.*?\]/g, '').trim();
        }
      }

      // Genres fallback from Kodik
      if (needsGenres) {
        const genres = mat.anime_genres || mat.genres;
        if (Array.isArray(genres) && genres.length > 0) {
          anime.genres = genres.map((g: any) => String(g).trim()).filter(Boolean);
        }
      }

      // Image & Cover fallback from Kodik
      if (needsImage && mat.poster_url) {
        anime.image = mat.poster_url;
      }
      if (needsCover) {
        const coverCandidates = mat.anime_photos || mat.screenshots || [];
        if (Array.isArray(coverCandidates) && coverCandidates.length > 0 && coverCandidates[0]) {
          anime.cover = coverCandidates[0];
        } else if (mat.poster_url) {
          anime.cover = mat.poster_url;
        }
      }

      // Supplementary metadata
      if (!anime.year && mat.year) {
        anime.year = Number(mat.year);
      }
      if (!anime.episodes && (mat.episodes_total || best.episodes_count)) {
        anime.episodes = Number(mat.episodes_total || best.episodes_count);
      }
      if (!anime.kinopoiskId && (mat.kinopoisk_id || best.kinopoisk_id)) {
        anime.kinopoiskId = String(mat.kinopoisk_id || best.kinopoisk_id);
      }
      if (!anime.imdbId && (mat.imdb_id || best.imdb_id)) {
        anime.imdbId = String(mat.imdb_id || best.imdb_id);
      }
    }
  } catch (err) {
    console.warn('[enrichAnimeWithKodik] Kodik metadata enrichment error:', err);
  }

  return anime;
};

export const fetchAnimeDetails = async (id: string, includeScreenshots = false): Promise<Anime | null> => {
  if (!id) return null;
  const cacheKey = `anime_details_v4_${id}`;
  const cached = getFromStorage(cacheKey);
  if (cached) {
    const isCompleted = cached.data?.status === 'Completed';
    // Very long cache: 1 year (365 days) for completed, 30 days for ongoing
    const ttl = isCompleted ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
  }
  try {
    const data = await getAnimeById(id);
    if (!data) {
      if (cached) return cached.data;
      return null;
    }
    
    let anime = await mapAnime(data);

    // If description, genres or images are missing from Shikimori, pull them from Kodik
    anime = await enrichAnimeWithKodik(anime, id, anime.title);

    // Fetch custom SEO description from our database
    try {
      const seoData = await db.getAnimeSeo(id);
      if (seoData && seoData.seo_description) {
        anime.description = seoData.seo_description;
        (anime as any).is_seo_generated = seoData.is_seo_generated;
      }
    } catch (e) {
      console.warn('Failed to fetch custom SEO description', e);
    }

    // Fetch screenshots to find a better cover (landscape) for hero banners
    if (includeScreenshots) {
        try {
            const screenshots = await fetchApi(`/animes/${id}/screenshots`, 1, false, LONG_CACHE_TTL, 0);
            if (Array.isArray(screenshots) && screenshots.length > 0) {
                 const validScreen = screenshots.find((s: any) => s.original && !s.original.includes('missing'));
                 if (validScreen) {
                     anime.cover = proxyImage(validScreen.original);
                     if (anime.image === PLACEHOLDER_IMAGE) {
                         anime.image = anime.cover;
                     }
                 }
            }
        } catch (e) {
            console.warn('Failed to fetch fallback screenshots', e);
        }
    }

    saveToStorage(cacheKey, anime);
    return anime;
  } catch (e) {
    console.warn(`[Anime Details] Failed to load API. Error:`, e);
    if (cached) {
      console.warn(`[Shikimori Service] Using stale cache for details of ID ${id} after error.`);
      return cached.data;
    }
    return null;
  }
};

export const fetchAnimeScreenshots = async (id: string): Promise<string[]> => {
  if (!id) return [];
  
  const cacheKey = `anime_screenshots_v4_${id}`;
  const cached = getFromStorage(cacheKey);
  
  const ttl = 180 * 24 * 60 * 60 * 1000; // 180 days long-term cache
  if (cached && (Date.now() - cached.timestamp < ttl)) {
    return cached.data;
  }

  try {
    const data = await fetchApi(`/animes/${id}/screenshots`, 1, false, LONG_CACHE_TTL, 0);
    let results = Array.isArray(data) ? data.map((s: any) => proxyImage(s.original)).filter(Boolean) : [];
    
    // If Shikimori has no screenshots, fall back to Kodik material_data screenshots
    if (results.length === 0) {
      try {
        const kodikRes = await fetch(`/api/media/search?shikimori_id=${id}`);
        if (kodikRes.ok) {
          const kData = await kodikRes.json();
          if (kData?.results && kData.results.length > 0) {
            const mat = kData.results[0].material_data || {};
            const kScreens = mat.screenshots || mat.anime_photos || [];
            if (Array.isArray(kScreens) && kScreens.length > 0) {
              results = kScreens.filter(Boolean);
            }
          }
        }
      } catch (_) {}
    }

    if (results.length > 0) {
      saveToStorage(cacheKey, results);
    }
    return results;
  } catch (e) {
    if (cached) return cached.data;
    return [];
  }
};

export const fetchAnimeVideos = async (id: string): Promise<{ name: string; url: string; image: string }[]> => {
  if (!id) return [];
  
  const cacheKey = `anime_videos_v4_${id}`;
  const cached = getFromStorage(cacheKey);
  
  const ttl = 180 * 24 * 60 * 60 * 1000; // 180 days long-term cache
  if (cached && (Date.now() - cached.timestamp < ttl)) {
    return cached.data;
  }

  try {
    const data = await fetchApi(`/animes/${id}/videos`, 2, false, LONG_CACHE_TTL, 0);
    if (Array.isArray(data)) {
      const results = data.map((v: any) => ({
        name: v.name || 'Трейлер',
        url: v.url,
        image: v.image_url
      })).filter((v: any) => v.url);
      
      if (results.length > 0) {
        saveToStorage(cacheKey, results);
      }
      return results;
    }
    if (cached) return cached.data;
    return [];
  } catch (e) {
    if (cached) return cached.data;
    return [];
  }
};

export const fetchRelatedAnimes = async (id: string): Promise<{ relation: string; anime: Anime }[]> => {
  if (!id) return [];
  
  const cacheKey = `anime_related_v3_${id}`;
  const cached = getFromStorage(cacheKey);
  
  const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (cached && (Date.now() - cached.timestamp < ttl)) {
    return cached.data;
  }

  try {
    // Priority 0 for secondary data
    const data = await fetchApi(`/animes/${id}/related`, 2, false, CACHE_TTL, 0);
    if (Array.isArray(data)) {
      const items = data
        .filter((item: any) => !!item.anime)
        .slice(0, 10);
      
      const results = await Promise.all(items.map(async (item: any) => ({
          relation: item.relation_russian || item.relation || 'Связанное',
          anime: await mapAnime(item.anime)
      })));
      
      saveToStorage(cacheKey, results);
      return results;
    }
    if (cached) return cached.data;
    return [];
  } catch (e) {
    if (cached) return cached.data;
    return [];
  }
};

export const fetchSimilarAnimes = async (id: string): Promise<Anime[]> => {
  if (!id) return [];
  
  const cacheKey = `anime_similar_v3_${id}`;
  const cached = getFromStorage(cacheKey);
  
  const ttl = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (cached && (Date.now() - cached.timestamp < ttl)) {
    return cached.data;
  }

  try {
    // Priority 0 for secondary data
    const data = await fetchApi(`/animes/${id}/similar`, 2, false, CACHE_TTL, 0);
    if (!data || !Array.isArray(data)) {
      if (cached) return cached.data;
      return MOCK_ANIME.slice(0, 4);
    }
    const results = await Promise.all(data.slice(0, 10).map(mapAnime));
    saveToStorage(cacheKey, results);
    return results;
  } catch (e) {
    if (cached) return cached.data;
    return MOCK_ANIME.slice(0, 4);
  }
};

export const fetchCalendar = async (): Promise<ScheduleItem[]> => {
  try {
    // Priority 1 for list views
    const data = await fetchApi(`/calendar`, 2, false, CACHE_TTL, 1);
    if (!data || !Array.isArray(data)) return SCHEDULE;

    const daysMap: Record<string, any[]> = { 'Пн': [], 'Вт': [], 'Ср': [], 'Чт': [], 'Пт': [], 'Сб': [], 'Вс': [] };
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    
    data.forEach(i => { 
    if (!i.next_episode_at || !i.anime) return;
    const d = new Date(i.next_episode_at);
    const name = dayNames[d.getDay()];
    if (daysMap[name]) {
        daysMap[name].push({ 
            id: i.anime.id.toString(), 
            time: d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }), 
            title: i.anime.russian || i.anime.name,
            slug: slugify(i.anime.name || i.anime.russian || '')
        });
    }
    });
    
    const orderedDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    return orderedDays.map(day => ({ day, animes: daysMap[day] }));
  } catch (e) {
    return SCHEDULE;
  }
};

export const fetchNews = async (): Promise<NewsItem[]> => {
  try {
    // Cache news for 30 minutes to improve performance
    // Priority 1 for list views
    const data = await fetchApi(`/topics?forum=news&limit=12&linked_type=Anime`, 2, false, CACHE_TTL, 1);
    if (!data || !Array.isArray(data)) return MOCK_NEWS;

    const newsItems = data.map(topic => {
      const html = topic.html_body || topic.body || '';
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
      const ytMatch = html.match(ytRegex);
      
      let videoId = ytMatch ? ytMatch[1] : undefined;
      
      // Optimization: Do NOT fetch linked anime videos for the list view to avoid N+1 requests and 429 errors.
      // We only fetch videos in the details view.

      const rawBody = topic.body || '';
      const cleanBody = rawBody.replace(/<[^>]*>?/gm, '').replace(/\[.*?\]/g, '').trim();
      const summary = cleanBody.slice(0, 150) + (cleanBody.length > 150 ? '...' : '');

      return {
        id: topic.id.toString(),
        title: topic.topic_title || 'Без названия',
        summary: summary,
        date: new Date(topic.created_at).toLocaleDateString('ru-RU'),
        category: 'Новости',
        image: imgMatch ? imgMatch[1] : undefined,
        video: videoId,
        linkedId: topic.linked_id,
        // Optimization: Skip heavy HTML processing for the list view and don't return full HTML
        html_body: undefined 
      };
    });
    
    return newsItems;
  } catch (e) {
    return MOCK_NEWS;
  }
};

export const fetchNewsDetails = async (id: string): Promise<NewsItem | null> => {
  try {
    // Priority 2 for details
    const topic = await fetchApi(`/topics/${id}`, 2, true, CACHE_TTL, 2);
    if (!topic) return MOCK_NEWS.find(n => n.id === id) || MOCK_NEWS[0];

    const html = topic.html_body || topic.body || '';
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
    const ytMatch = html.match(ytRegex);

    let videoId = ytMatch ? ytMatch[1] : undefined;

    return {
      id: topic.id.toString(),
      title: topic.topic_title,
      summary: (topic.body || '').slice(0, 200).replace(/\[.*?\]/g, ''),
      date: new Date(topic.created_at).toLocaleDateString('ru-RU'),
      category: 'Новости',
      image: imgMatch ? imgMatch[1] : undefined,
      video: videoId,
      linkedId: topic.linked?.id || topic.linked_id,
      html_body: processNewsHtml(html) // Apply HTML processing
    };
  } catch (e) {
    return MOCK_NEWS.find(n => n.id === id) || MOCK_NEWS[0];
  }
};
