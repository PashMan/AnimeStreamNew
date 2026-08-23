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

const DEFAULT_INITIAL_SUGGESTIONS = [
  {
    id: 'sug-40028',
    animeId: '40028',
    title: 'Атака титанов: Финал',
    originalName: 'Shingeki no Kyojin: The Final Season',
    image: 'https://desu.shikimori.one/system/animes/original/40028.jpg',
    year: '2020',
    genres: ['Экшен', 'Драма', 'Фэнтези'],
    votes: 384,
    voters: [],
    suggestedBy: {
      email: 'animemaster@kamianime.club',
      name: 'AnimeMaster',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
    },
    createdAt: Date.now() - 3600000 * 12
  },
  {
    id: 'sug-40456',
    animeId: '40456',
    title: 'Клинок, рассекающий демонов: Поезд «Бесконечный»',
    originalName: 'Kimetsu no Yaiba Movie: Mugen Ressha-hen',
    image: 'https://desu.shikimori.one/system/animes/original/40456.jpg',
    year: '2020',
    genres: ['Экшен', 'Сверхъестественное', 'Исторический'],
    votes: 421,
    voters: [],
    suggestedBy: {
      email: 'zenitsu@kamianime.club',
      name: 'ZenitsuFan',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80'
    },
    createdAt: Date.now() - 3600000 * 10
  },
  {
    id: 'sug-51009',
    animeId: '51009',
    title: 'Магическая битва 2',
    originalName: 'Jujutsu Kaisen 2nd Season',
    image: 'https://desu.shikimori.one/system/animes/original/51009.jpg',
    year: '2023',
    genres: ['Экшен', 'Сверхъестественное', 'Сёнэн'],
    votes: 356,
    voters: [],
    suggestedBy: {
      email: 'gojo@kamianime.club',
      name: 'Gojo_Sensei',
      avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80'
    },
    createdAt: Date.now() - 3600000 * 8
  },
  {
    id: 'sug-44511',
    animeId: '44511',
    title: 'Человек-бензопила',
    originalName: 'Chainsaw Man',
    image: 'https://desu.shikimori.one/system/animes/original/44511.jpg',
    year: '2022',
    genres: ['Экшен', 'Сверхъестественное'],
    votes: 298,
    voters: [],
    suggestedBy: {
      email: 'denji@kamianime.club',
      name: 'DenjiHero',
      avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&auto=format&fit=crop&q=80'
    },
    createdAt: Date.now() - 3600000 * 6
  },
  {
    id: 'sug-37987',
    animeId: '37987',
    title: 'Вайолет Эвергарден: Фильм',
    originalName: 'Violet Evergarden Movie',
    image: 'https://desu.shikimori.one/system/animes/original/37987.jpg',
    year: '2020',
    genres: ['Драма', 'Фэнтези', 'Повседневность'],
    votes: 275,
    voters: [],
    suggestedBy: {
      email: 'violet@kamianime.club',
      name: 'EvergardenLover',
      avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&auto=format&fit=crop&q=80'
    },
    createdAt: Date.now() - 3600000 * 4
  },
  {
    id: 'sug-50594',
    animeId: '50594',
    title: 'Судзумэ, закрывающая двери',
    originalName: 'Suzume no Tojimari',
    image: 'https://desu.shikimori.one/system/animes/original/50594.jpg',
    year: '2022',
    genres: ['Приключения', 'Фэнтези'],
    votes: 310,
    voters: [],
    suggestedBy: {
      email: 'makoto@kamianime.club',
      name: 'MakotoFan',
      avatar: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=100&auto=format&fit=crop&q=80'
    },
    createdAt: Date.now() - 3600000 * 2
  }
];

function getFallbackState(): Vote4KSeason {
  const cached = getCachedState();
  if (cached && cached.suggestions && cached.suggestions.length > 0) return cached;

  const now = Date.now();
  return {
    seasonNumber: 1,
    stage: 'suggestions',
    cycleStartTime: now,
    stageStartTime: now,
    stageEndTime: now + 2 * 24 * 60 * 60 * 1000,
    suggestions: [...DEFAULT_INITIAL_SUGGESTIONS],
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
