import { Vote4KSeason } from '../types';

const STORAGE_KEY = 'kamianime_vote4k_state_cache_v2';

function getCachedState(): Vote4KSeason | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.stageEndTime === 'number') {
      return parsed;
    }
  } catch (_) {}
  return null;
}

function setCachedState(state: Vote4KSeason) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function getFallbackState(): Vote4KSeason {
  const cached = getCachedState();
  if (cached) return cached;

  const now = Date.now();
  return {
    seasonNumber: 1,
    stage: 'suggestions',
    cycleStartTime: now,
    stageStartTime: now,
    stageEndTime: now + 2 * 24 * 60 * 60 * 1000,
    suggestions: [], // STRICT: No fake anime, only real user submissions
    finalCandidates: [],
    winner: null,
    historyWinners: []
  };
}

export const Vote4KService = {
  async getState(): Promise<Vote4KSeason> {
    try {
      const res = await fetch('/api/vote4k', {
        headers: { 
          'Accept': 'application/json',
          'Cache-Control': 'no-cache' 
        }
      });
      
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        return getFallbackState();
      }

      const data: Vote4KSeason = await res.json();
      if (data && typeof data.seasonNumber === 'number') {
        setCachedState(data);
        return data;
      }
      return getFallbackState();
    } catch (e) {
      console.warn('[Vote4K] Error fetching state, returning cached/fallback:', e);
      return getFallbackState();
    }
  },

  async suggestAnime(params: {
    animeId: string;
    title: string;
    originalName?: string;
    image: string;
    year?: string | number;
    genres?: string[];
    userEmail: string;
    userName: string;
    userAvatar?: string;
  }): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
    try {
      const res = await fetch('/api/vote4k/suggest', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(params)
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Сервер вернул некорректный ответ');
      }
      const result = await res.json();
      if (result?.state) {
        setCachedState(result.state);
      }
      return result;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Ошибка отправки предложения',
        state: getFallbackState()
      };
    }
  },

  async upvoteSuggestion(
    suggestionId: string,
    userEmail: string
  ): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
    try {
      const res = await fetch('/api/vote4k/upvote', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ suggestionId, userEmail })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Сервер вернул некорректный ответ');
      }
      const result = await res.json();
      if (result?.state) {
        setCachedState(result.state);
      }
      return result;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Ошибка голосования',
        state: getFallbackState()
      };
    }
  },

  async voteFinal(
    candidateId: string,
    userEmail: string
  ): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
    try {
      const res = await fetch('/api/vote4k/vote-final', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ candidateId, userEmail })
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Сервер вернул некорректный ответ');
      }
      const result = await res.json();
      if (result?.state) {
        setCachedState(result.state);
      }
      return result;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Ошибка голосования',
        state: getFallbackState()
      };
    }
  }
};
