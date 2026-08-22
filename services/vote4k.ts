import { Vote4KSeason } from '../types';

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
        const text = await res.text();
        console.warn('[Vote4K] Received non-JSON response from server, using fallback state:', text.slice(0, 100));
        return getFallbackState();
      }

      return await res.json();
    } catch (e) {
      console.warn('[Vote4K] Error fetching state, returning fallback:', e);
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
      return await res.json();
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
      return await res.json();
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
      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Ошибка голосования',
        state: getFallbackState()
      };
    }
  }
};

function getFallbackState(): Vote4KSeason {
  const now = Date.now();
  return {
    seasonNumber: 1,
    stage: 'suggestions',
    cycleStartTime: now,
    stageStartTime: now,
    stageEndTime: now + 2 * 24 * 60 * 60 * 1000,
    suggestions: [
      {
        id: 'shiki_5114',
        animeId: '5114',
        title: 'Стальной алхимик: Братство',
        originalName: 'Fullmetal Alchemist: Brotherhood',
        image: 'https://desu.shikimori.one/system/animes/original/5114.jpg',
        year: '2009',
        genres: ['Экшен', 'Приключения', 'Фэнтези', 'Драма'],
        suggestedBy: {
          email: 'kami.admin@kamianime.club',
          name: 'KamiAnime Community',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'
        },
        votes: 4,
        voters: ['user1@demo.com', 'user2@demo.com', 'user3@demo.com', 'user4@demo.com'],
        createdAt: now - 3600000 * 5
      },
      {
        id: 'shiki_40748',
        animeId: '40748',
        title: 'Магическая битва',
        originalName: 'Jujutsu Kaisen',
        image: 'https://desu.shikimori.one/system/animes/original/40748.jpg',
        year: '2020',
        genres: ['Экшен', 'Сверхъестественное', 'Фэнтези'],
        suggestedBy: {
          email: 'satoru@kami.club',
          name: 'Gojo Satoru',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100'
        },
        votes: 3,
        voters: ['user1@demo.com', 'user2@demo.com', 'user5@demo.com'],
        createdAt: now - 3600000 * 4
      },
      {
        id: 'shiki_38000',
        animeId: '38000',
        title: 'Клинок, рассекающий демонов',
        originalName: 'Kimetsu no Yaiba',
        image: 'https://desu.shikimori.one/system/animes/original/38000.jpg',
        year: '2019',
        genres: ['Экшен', 'Демоны', 'Исторический'],
        suggestedBy: {
          email: 'tanjiro@kami.club',
          name: 'Kamado',
          avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100'
        },
        votes: 3,
        voters: ['user3@demo.com', 'user4@demo.com', 'user6@demo.com'],
        createdAt: now - 3600000 * 3
      },
      {
        id: 'shiki_16498',
        animeId: '16498',
        title: 'Атака титанов',
        originalName: 'Shingeki no Kyojin',
        image: 'https://desu.shikimori.one/system/animes/original/16498.jpg',
        year: '2013',
        genres: ['Экшен', 'Драма', 'Военное'],
        suggestedBy: {
          email: 'eren@kami.club',
          name: 'Eren Jaeger',
          avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100'
        },
        votes: 4,
        voters: ['user1@demo.com', 'user2@demo.com', 'user7@demo.com', 'user8@demo.com'],
        createdAt: now - 3600000 * 2
      }
    ],
    finalCandidates: [],
    winner: null,
    historyWinners: [
      {
        seasonNumber: 0,
        winner: {
          id: 'shiki_50594',
          animeId: '50594',
          title: 'Судзумэ, закрывающая двери',
          originalName: 'Suzume no Tojimari',
          image: 'https://desu.shikimori.one/system/animes/original/50594.jpg',
          year: '2022',
          genres: ['Приключения', 'Фэнтези'],
          votes: 142,
          voters: []
        },
        endedAt: now - 3600000 * 24 * 7
      }
    ]
  };
}
