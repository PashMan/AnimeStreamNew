import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHIKIMORI_API = 'https://shikimori.one/api';
const D1_API_URL = process.env.D1_API_URL || 'https://kamianime.club/api/db/query';

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

async function queryD1(payload: any) {
    try {
        const res = await fetch(D1_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            throw new Error(`D1 API error! status: ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.error("D1 Query Error:", e);
        return { data: null, error: e };
    }
}

async function getAnimeSeo(animeId: string) {
    const result = await queryD1({
        table: 'anime_seo',
        action: 'select',
        cols: 'seo_description, is_seo_generated',
        wheres: [{ col: 'anime_id', op: '=', val: animeId }],
        isSingle: true
    });
    return result.data;
}

async function saveAnimeSeo(animeId: string, description: string, isGenerated: boolean = true) {
    // Delete existing
    await queryD1({
        table: 'anime_seo',
        action: 'delete',
        wheres: [{ col: 'anime_id', op: '=', val: animeId }]
    });
    
    // Insert new
    const result = await queryD1({
        table: 'anime_seo',
        action: 'insert',
        payload: {
            anime_id: animeId,
            seo_description: description,
            is_seo_generated: isGenerated,
            updated_at: new Date().toISOString()
        }
    });
    
    return !result.error;
}

import Groq from 'groq-sdk';
// ... (rest of imports)

// ...

async function generateSeoForAnime(animeId: string) {
    try {
        // Check if SEO description already exists
        const existingSeo = await getAnimeSeo(animeId);
        if (existingSeo && existingSeo.seo_description) {
            console.log(`[Skip] Anime ${animeId} already has SEO description.`);
            return true;
        }

        console.log(`[Process] Fetching details for anime ${animeId}...`);
        const data = await fetchWithRetry(`${SHIKIMORI_API}/animes/${animeId}`);
        if (!data) {
            console.error(`[Error] Failed to fetch details for anime ${animeId}`);
            return false;
        }

        const title = data.russian || data.name || 'Без названия';
        const originalName = data.name || '';
        const genres = data.genres ? data.genres.map((g: any) => g.russian || g.name) : [];
        const description = (data.description || 'Описание отсутствует').replace(/\[.*?\]/g, '').trim();
        const year = data.aired_on ? new Date(data.aired_on).getFullYear() : (data.released_on ? new Date(data.released_on).getFullYear() : 0);

        console.log(`[Process] Generating SEO description for "${title}"...`);
        
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const prompt = `Ты — эксперт по SEO для аниме-сайтов. Напиши захватывающее SEO-описание для аниме "${title}" (${originalName}, ${year}).
        Жанры: ${genres.join(', ')}.
        Краткий сюжет: ${description}.
        
        Требования к описанию:
        1. Уникальное и привлекательное (не копируй исходный сюжет слово в слово).
        2. Содержит ключевые слова, связанные с жанрами и названием.
        3. Объем: 100-150 слов.
        4. В конце добавь призыв к действию: "Смотреть аниме ${title} онлайн в хорошем качестве на нашем сайте".
        
        Верни ТОЛЬКО текст описания, без лишних комментариев, разметок или кавычек.`;

        const response = await groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: prompt }],
        });
        
        const seoDescription = response.choices[0]?.message?.content?.trim();

        if (!seoDescription) {
            console.error(`[Error] Failed to generate SEO description for anime ${animeId}`);
            return false;
        }

        console.log(`[Process] Saving SEO description for "${title}"...`);
        const saved = await saveAnimeSeo(animeId, seoDescription, true);
        
        if (saved) {
            console.log(`[Success] Saved SEO description for anime ${animeId}`);
            return true;
        } else {
            console.error(`[Error] Failed to save SEO description for anime ${animeId}`);
            return false;
        }
    } catch (error) {
        console.error(`[Error] Exception processing anime ${animeId}:`, error);
        return false;
    }
}

async function processYear(year: number) {
    const MAX_PAGES_PER_YEAR = 10; // 500 items per year
    console.log(`\n--- Processing Year ${year} ---`);

    for (let page = 1; page <= MAX_PAGES_PER_YEAR; page++) {
        const url = `${SHIKIMORI_API}/animes?limit=50&order=popularity&season=${year}&page=${page}`;
        const data = await fetchWithRetry(url);
        
        if (!data || !Array.isArray(data) || data.length === 0) {
            break; 
        }
        
        for (const anime of data) {
            await generateSeoForAnime(anime.id.toString());
            await delay(10000); // Delay between anime to avoid Gemini/Shikimori rate limits
        }
    }
}

async function main() {
    console.log('Starting SEO description generation...');
    
    // Check API key
    if (!process.env.GROQ_API_KEY) {
        console.error('Error: GROQ_API_KEY environment variable is missing.');
        console.error('Please add it to your .env file.');
        process.exit(1);
    }

    const currentYear = new Date().getFullYear();
    const startYear = 2000;
    
    // Process from newest to oldest
    for (let year = currentYear; year >= startYear; year--) {
        await processYear(year);
    }
    
    console.log('\nFinished SEO description generation.');
}

main().catch(console.error);
