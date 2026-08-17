import React, { useState, useRef, useEffect } from 'react';
import { db } from '../services/db';
import { generateAnimeSeoDescription } from '../services/seoService';
import { Play, Square, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const SHIKIMORI_API = '/api/shikimori';
const MAX_RETRIES = 10;
const BASE_DELAY = 5000;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, retries = 0): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.ok) {
      return await response.json();
    }

    const status = response.status;
    
    if (status === 404 || status === 422) {
      return null; // Return null for not found
    }
    
    if (retries >= MAX_RETRIES) {
      console.error(`[AdminSeoPanel] Max retries reached for ${url}`);
      return null;
    }

    if (status === 429 || status === 403 || status >= 500) {
      const retryAfter = response.headers.get('Retry-After');
      const delayTime = retryAfter ? parseInt(retryAfter) * 1000 : BASE_DELAY * Math.pow(1.5, retries);
      console.warn(`[AdminSeoPanel] Rate limit or server error (${status}). Retrying in ${delayTime}ms...`);
      await delay(delayTime);
      return fetchWithRetry(url, retries + 1);
    }

    return null;
  } catch (error) {
    if (retries >= MAX_RETRIES) {
      console.error(`[AdminSeoPanel] Network error max retries reached for ${url}`, error);
      return null;
    }
    const delayTime = BASE_DELAY * Math.pow(1.5, retries);
    console.warn(`[AdminSeoPanel] Network error. Retrying in ${delayTime}ms...`);
    await delay(delayTime);
    return fetchWithRetry(url, retries + 1);
  }
}

export const AdminSeoPanel: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<{ id: string, message: string, type: 'info' | 'success' | 'error' }[]>([]);
  const [stats, setStats] = useState({ processed: 0, skipped: 0, generated: 0, errors: 0 });
  const [customApiKey, setCustomApiKey] = useState('');
  
  const isRunningRef = useRef(isRunning);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, { id: Math.random().toString(36).substring(7), message, type }]);
  };

  // Check env API key
  let envApiKey = '';
  try {
    // @ts-ignore
    envApiKey = import.meta.env.VITE_GROQ_API_KEY;
  } catch (e) {}
  
  if (!envApiKey) {
    // @ts-ignore
    envApiKey = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY || '';
  }

  const startGeneration = async () => {
    if (isRunning) return;
    
    const finalApiKey = envApiKey || customApiKey;
    
    if (!finalApiKey) {
      addLog('Ошибка: Ключ Groq API не найден. Введите его в поле ниже или добавьте в секреты AI Studio.', 'error');
      return;
    }

    setIsRunning(true);
    isRunningRef.current = true;
    addLog('Запуск генерации SEO-описаний...', 'info');
    
    const currentYear = new Date().getFullYear();
    const startYear = 2000;
    
    try {
      for (let year = currentYear; year >= startYear; year--) {
        if (!isRunningRef.current) break;
        await processYear(year, finalApiKey);
      }
      if (isRunningRef.current) {
        addLog('Генерация SEO-описаний завершена!', 'success');
      } else {
        addLog('Генерация остановлена пользователем.', 'info');
      }
    } catch (error: any) {
      addLog(`Критическая ошибка: ${error.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  const stopGeneration = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    addLog('Остановка генерации... (дождитесь завершения текущего запроса)', 'info');
  };

  const processYear = async (year: number, apiKey: string) => {
    const MAX_PAGES_PER_YEAR = 10; // 500 items per year
    addLog(`--- Обработка года: ${year} ---`, 'info');

    for (let page = 1; page <= MAX_PAGES_PER_YEAR; page++) {
      if (!isRunningRef.current) break;
      
      const url = `${SHIKIMORI_API}/animes?limit=50&order=popularity&season=${year}&page=${page}`;
      const data = await fetchWithRetry(url);
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        break; 
      }
      
      for (const anime of data) {
        if (!isRunningRef.current) break;
        await generateSeoForAnime(anime.id.toString(), apiKey);
        await delay(10000); // Увеличена задержка до 10 секунд для соблюдения TPM
      }
    }
  };

  const generateSeoForAnime = async (animeId: string, apiKey: string) => {
    try {
      // Check if SEO description already exists
      const existingSeo = await db.getAnimeSeo(animeId);
      if (existingSeo && existingSeo.seo_description) {
        addLog(`[Пропуск] Аниме ${animeId} уже имеет SEO-описание.`, 'info');
        setStats(s => ({ ...s, processed: s.processed + 1, skipped: s.skipped + 1 }));
        return true;
      }

      const data = await fetchWithRetry(`${SHIKIMORI_API}/animes/${animeId}`);
      if (!data) {
        addLog(`[Ошибка] Не удалось получить данные для аниме ${animeId}`, 'error');
        setStats(s => ({ ...s, processed: s.processed + 1, errors: s.errors + 1 }));
        return false;
      }

      const title = data.russian || data.name || 'Без названия';
      const originalName = data.name || '';
      const genres = data.genres ? data.genres.map((g: any) => g.russian || g.name) : [];
      const description = (data.description || 'Описание отсутствует').replace(/\[.*?\]/g, '').trim();
      const year = data.aired_on ? new Date(data.aired_on).getFullYear() : (data.released_on ? new Date(data.released_on).getFullYear() : 0);

      addLog(`[Генерация] Создание SEO для "${title}"...`, 'info');
      
      const seoDescription = await generateAnimeSeoDescription({
        title,
        originalName,
        genres,
        description,
        year
      }, apiKey);

      if (!seoDescription) {
        addLog(`[Ошибка] Gemini не смог сгенерировать описание для "${title}"`, 'error');
        setStats(s => ({ ...s, processed: s.processed + 1, errors: s.errors + 1 }));
        return false;
      }

      const saved = await db.saveAnimeSeo(animeId, seoDescription, true);
      
      if (saved) {
        addLog(`[Успех] Сохранено SEO-описание для "${title}"`, 'success');
        setStats(s => ({ ...s, processed: s.processed + 1, generated: s.generated + 1 }));
        return true;
      } else {
        addLog(`[Ошибка] Не удалось сохранить описание для "${title}" в БД`, 'error');
        setStats(s => ({ ...s, processed: s.processed + 1, errors: s.errors + 1 }));
        return false;
      }
    } catch (error: any) {
      addLog(`[Ошибка] Исключение при обработке аниме ${animeId}: ${error.message}`, 'error');
      setStats(s => ({ ...s, processed: s.processed + 1, errors: s.errors + 1 }));
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Генератор SEO-описаний (AI)</h2>
            <p className="text-sm text-gray-400">
              Автоматически собирает аниме с Shikimori, генерирует уникальные SEO-описания через Gemini API и сохраняет в базу данных.
            </p>
          </div>
          
          <div className="flex gap-3">
            {!isRunning ? (
              <button
                onClick={startGeneration}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-colors"
              >
                <Play className="w-4 h-4" />
                Запустить
              </button>
            ) : (
              <button
                onClick={stopGeneration}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
              >
                <Square className="w-4 h-4" />
                Остановить
              </button>
            )}
          </div>
        </div>

        {!envApiKey && (
          <div className="mb-6 bg-slate-900/50 border border-yellow-500/30 rounded-lg p-4">
            <label className="block text-sm font-medium text-yellow-400 mb-2">
              Gemini API Key не найден в секретах. Введите его вручную для текущей сессии:
            </label>
            <input
              type="password"
              value={customApiKey}
              onChange={e => setCustomApiKey(e.target.value)}
              className="w-full bg-black/50 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
              placeholder="AIzaSy..."
              disabled={isRunning}
            />
            <p className="text-xs text-gray-400 mt-2">
              Чтобы не вводить ключ каждый раз, добавьте секрет <strong>VITE_GEMINI_API_KEY</strong> в настройках AI Studio и нажмите "Apply changes".
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-900/50 border border-white/5 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Обработано</div>
            <div className="text-2xl font-bold text-white">{stats.processed}</div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Сгенерировано</div>
            <div className="text-2xl font-bold text-green-400">{stats.generated}</div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Пропущено (уже есть)</div>
            <div className="text-2xl font-bold text-blue-400">{stats.skipped}</div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 rounded-lg p-4">
            <div className="text-sm text-gray-400 mb-1">Ошибки</div>
            <div className="text-2xl font-bold text-red-400">{stats.errors}</div>
          </div>
        </div>

        <div className="bg-black/50 border border-white/10 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">Логи появятся здесь после запуска...</div>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-gray-500 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                  <span className={`
                    ${log.type === 'error' ? 'text-red-400' : ''}
                    ${log.type === 'success' ? 'text-green-400' : ''}
                    ${log.type === 'info' ? 'text-gray-300' : ''}
                  `}>
                    {log.type === 'error' && <AlertCircle className="w-4 h-4 inline mr-1 -mt-0.5" />}
                    {log.type === 'success' && <CheckCircle2 className="w-4 h-4 inline mr-1 -mt-0.5" />}
                    {log.type === 'info' && isRunning && log.message.includes('Создание SEO') && <Loader2 className="w-4 h-4 inline mr-1 -mt-0.5 animate-spin" />}
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
