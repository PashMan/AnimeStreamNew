import * as fs from 'node:fs';
import * as path from 'node:path';
import { Vote4KSeason, Vote4KSuggestion, Vote4KFinalCandidate } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'vote4k_state.json');

// Durations
export const STAGE_SUGGESTIONS_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
export const STAGE_VOTING_MS = 3 * 24 * 60 * 60 * 1000;      // 3 days
export const STAGE_WINNER_MS = 2 * 24 * 60 * 60 * 1000;      // 2 days
export const STAGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;    // 7 days (1 week)

// Seed suggestions for initial launch
const INITIAL_SEEDS: Vote4KSuggestion[] = [
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
    createdAt: Date.now() - 3600000 * 5
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
    createdAt: Date.now() - 3600000 * 4
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
    createdAt: Date.now() - 3600000 * 3
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
    createdAt: Date.now() - 3600000 * 2
  }
];

let state: Vote4KSeason | null = null;

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('[Vote4K] Error creating data directory:', e);
  }
}

function loadState(): Vote4KSeason {
  ensureDataDir();
  if (state) return state;

  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      state = JSON.parse(raw);
      if (state) {
        return checkAndAdvanceStage(state);
      }
    }
  } catch (e) {
    console.error('[Vote4K] Error loading state file:', e);
  }

  // Create initial season
  const now = Date.now();
  state = {
    seasonNumber: 1,
    stage: 'suggestions',
    cycleStartTime: now,
    stageStartTime: now,
    stageEndTime: now + STAGE_SUGGESTIONS_MS,
    suggestions: INITIAL_SEEDS,
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

  saveState(state);
  return state;
}

function saveState(s: Vote4KSeason) {
  ensureDataDir();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Vote4K] Error saving state file:', e);
  }
}

export function checkAndAdvanceStage(currentState: Vote4KSeason): Vote4KSeason {
  const now = Date.now();
  let modified = false;

  // We loop in case multiple stages have elapsed (e.g. server was off or long gap)
  let loopCount = 0;
  while (loopCount < 10) {
    loopCount++;

    if (currentState.stage === 'suggestions') {
      const isTimeOver = now >= currentState.stageEndTime;

      if (isTimeOver) {
        // Transition from suggestions to voting after 2 days
        // Pick Top 5 by votes
        const sorted = [...currentState.suggestions].sort((a, b) => b.votes - a.votes);
        const top5 = sorted.slice(0, 5);

        currentState.finalCandidates = top5.map((s) => ({
          id: s.id,
          animeId: s.animeId,
          title: s.title,
          originalName: s.originalName,
          image: s.image,
          year: s.year,
          genres: s.genres,
          votes: 0,
          voters: []
        }));

        currentState.stage = 'voting';
        currentState.stageStartTime = now;
        currentState.stageEndTime = now + STAGE_VOTING_MS;
        modified = true;
        console.log(`[Vote4K] Advanced Season #${currentState.seasonNumber} to 'voting'. Top candidates: ${currentState.finalCandidates.length}`);
        continue;
      }
      break;
    }

    if (currentState.stage === 'voting') {
      if (now >= currentState.stageEndTime) {
        // Transition from voting to winner
        const sortedCandidates = [...currentState.finalCandidates].sort(
          (a, b) => b.votes - a.votes
        );
        const winningCandidate = sortedCandidates[0] || null;

        currentState.winner = winningCandidate;
        if (winningCandidate) {
          if (!currentState.historyWinners) currentState.historyWinners = [];
          currentState.historyWinners.unshift({
            seasonNumber: currentState.seasonNumber,
            winner: winningCandidate,
            endedAt: now
          });
        }

        currentState.stage = 'winner';
        currentState.stageStartTime = now;
        currentState.stageEndTime = now + STAGE_WINNER_MS;
        modified = true;
        console.log(`[Vote4K] Advanced Season #${currentState.seasonNumber} to 'winner': ${winningCandidate?.title}`);
        continue;
      }
      break;
    }

    if (currentState.stage === 'winner') {
      if (now >= currentState.stageEndTime) {
        // Transition from winner to cooldown (1 week)
        currentState.stage = 'cooldown';
        currentState.stageStartTime = now;
        currentState.stageEndTime = now + STAGE_COOLDOWN_MS;
        modified = true;
        console.log(`[Vote4K] Advanced Season #${currentState.seasonNumber} to 'cooldown' for 7 days.`);
        continue;
      }
      break;
    }

    if (currentState.stage === 'cooldown') {
      if (now >= currentState.stageEndTime) {
        // Transition from cooldown to new suggestions season!
        currentState.seasonNumber += 1;
        currentState.stage = 'suggestions';
        currentState.suggestions = [];
        currentState.finalCandidates = [];
        currentState.winner = null;
        currentState.cycleStartTime = now;
        currentState.stageStartTime = now;
        currentState.stageEndTime = now + STAGE_SUGGESTIONS_MS;
        modified = true;
        console.log(`[Vote4K] Starting brand new Season #${currentState.seasonNumber}! Stage: 'suggestions'.`);
        continue;
      }
      break;
    }

    break;
  }

  if (modified) {
    saveState(currentState);
  }

  return currentState;
}

export function getVote4KState(): Vote4KSeason {
  const current = loadState();
  return checkAndAdvanceStage(current);
}

export function suggestAnimeFor4K(params: {
  animeId: string;
  title: string;
  originalName?: string;
  image: string;
  year?: string | number;
  genres?: string[];
  userEmail: string;
  userName: string;
  userAvatar?: string;
}): { success: boolean; message: string; state: Vote4KSeason } {
  const current = getVote4KState();

  if (current.stage !== 'suggestions') {
    return {
      success: false,
      message: 'Прием предложений сейчас закрыт. Идет другой этап голосования.',
      state: current
    };
  }

  if (!params.animeId || !params.title) {
    return {
      success: false,
      message: 'Не указан ID или название аниме.',
      state: current
    };
  }

  const existing = current.suggestions.find(
    (s) => String(s.animeId) === String(params.animeId) || s.title.toLowerCase() === params.title.toLowerCase()
  );

  const voterId = params.userEmail || `anon_${Date.now()}`;

  if (existing) {
    // If already suggested, add vote if user hasn't voted yet
    if (!existing.voters.includes(voterId)) {
      existing.voters.push(voterId);
      existing.votes += 1;
    }
  } else {
    // Create new suggestion
    const newSug: Vote4KSuggestion = {
      id: `shiki_${params.animeId}`,
      animeId: String(params.animeId),
      title: params.title,
      originalName: params.originalName,
      image: params.image,
      year: params.year,
      genres: params.genres || [],
      suggestedBy: {
        email: params.userEmail,
        name: params.userName || 'Пользователь KamiAnime',
        avatar: params.userAvatar
      },
      votes: 1,
      voters: [voterId],
      createdAt: Date.now()
    };
    current.suggestions.push(newSug);
  }

  const updated = checkAndAdvanceStage(current);
  saveState(updated);
  return {
    success: true,
    message: existing ? 'Голос за предложенный тайтл добавлен!' : 'Тайтл успешно предложен на 4K!',
    state: updated
  };
}

export function upvoteSuggestion(
  suggestionId: string,
  userEmail: string
): { success: boolean; message: string; state: Vote4KSeason } {
  const current = getVote4KState();

  if (current.stage !== 'suggestions') {
    return {
      success: false,
      message: 'Голосование за предложения сейчас закрыто.',
      state: current
    };
  }

  const sug = current.suggestions.find((s) => s.id === suggestionId || s.animeId === suggestionId);
  if (!sug) {
    return {
      success: false,
      message: 'Предложение не найдено.',
      state: current
    };
  }

  const voterId = userEmail || 'anonymous';
  if (sug.voters.includes(voterId)) {
    // Remove vote (toggle)
    sug.voters = sug.voters.filter((v) => v !== voterId);
    sug.votes = Math.max(0, sug.votes - 1);
  } else {
    // Add vote
    sug.voters.push(voterId);
    sug.votes += 1;
  }

  const updated = checkAndAdvanceStage(current);
  saveState(updated);
  return {
    success: true,
    message: 'Ваш голос обновлен!',
    state: updated
  };
}

export function voteFinalCandidate(
  candidateId: string,
  userEmail: string
): { success: boolean; message: string; state: Vote4KSeason } {
  const current = getVote4KState();

  if (current.stage !== 'voting') {
    return {
      success: false,
      message: 'Финальное голосование сейчас не активно.',
      state: current
    };
  }

  const voterId = userEmail || 'anonymous';

  // Remove previous vote from any candidate
  current.finalCandidates.forEach((c) => {
    if (c.voters.includes(voterId)) {
      c.voters = c.voters.filter((v) => v !== voterId);
      c.votes = Math.max(0, c.votes - 1);
    }
  });

  // Find candidate and cast vote
  const target = current.finalCandidates.find((c) => c.id === candidateId || c.animeId === candidateId);
  if (!target) {
    return {
      success: false,
      message: 'Кандидат не найден среди финалистов.',
      state: current
    };
  }

  target.voters.push(voterId);
  target.votes += 1;

  const updated = checkAndAdvanceStage(current);
  saveState(updated);
  return {
    success: true,
    message: `Вы успешно проголосовали за «${target.title}»!`,
    state: updated
  };
}
