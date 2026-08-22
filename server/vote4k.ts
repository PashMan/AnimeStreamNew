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

let inMemoryState: Vote4KSeason | null = null;

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (e) {
    console.error('[Vote4K] Error creating data directory:', e);
  }
}

/**
 * Initialize Cloudflare D1 table for 4K community voting if D1 is present
 */
export async function initD1Vote4K(db: any): Promise<void> {
  if (!db) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS vote4k_state (
        id TEXT PRIMARY KEY,
        season_number INTEGER NOT NULL,
        stage TEXT NOT NULL,
        cycle_start_time INTEGER NOT NULL,
        stage_start_time INTEGER NOT NULL,
        stage_end_time INTEGER NOT NULL,
        data_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `).run();
  } catch (e: any) {
    console.warn('[Vote4K D1 Init Warning]:', e?.message || e);
  }
}

function createInitialSeason(): Vote4KSeason {
  const now = Date.now();
  return {
    seasonNumber: 1,
    stage: 'suggestions',
    cycleStartTime: now,
    stageStartTime: now,
    stageEndTime: now + STAGE_SUGGESTIONS_MS,
    suggestions: [], // Start empty - ONLY real user suggestions will appear!
    finalCandidates: [],
    winner: null,
    historyWinners: []
  };
}

function loadFromFile(): Vote4KSeason {
  ensureDataDir();
  if (inMemoryState) return inMemoryState;

  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.seasonNumber === 'number') {
        inMemoryState = parsed;
        return inMemoryState!;
      }
    }
  } catch (e) {
    console.error('[Vote4K] Error reading state file:', e);
  }

  inMemoryState = createInitialSeason();
  saveToFile(inMemoryState);
  return inMemoryState;
}

function saveToFile(s: Vote4KSeason) {
  ensureDataDir();
  inMemoryState = s;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Vote4K] Error saving state file:', e);
  }
}

async function loadFromD1(db: any): Promise<Vote4KSeason | null> {
  if (!db) return null;
  try {
    await initD1Vote4K(db);
    const row = await db.prepare('SELECT data_json FROM vote4k_state WHERE id = ?').bind('active_season').first();
    if (row && row.data_json) {
      const parsed = JSON.parse(row.data_json);
      return parsed;
    }
  } catch (e: any) {
    console.warn('[Vote4K D1 Read Warning]:', e?.message || e);
  }
  return null;
}

async function saveToD1(db: any, s: Vote4KSeason): Promise<void> {
  if (!db) return;
  try {
    await initD1Vote4K(db);
    const now = Date.now();
    await db.prepare(`
      INSERT INTO vote4k_state (id, season_number, stage, cycle_start_time, stage_start_time, stage_end_time, data_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        season_number = excluded.season_number,
        stage = excluded.stage,
        cycle_start_time = excluded.cycle_start_time,
        stage_start_time = excluded.stage_start_time,
        stage_end_time = excluded.stage_end_time,
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `).bind(
      'active_season',
      s.seasonNumber,
      s.stage,
      s.cycleStartTime,
      s.stageStartTime,
      s.stageEndTime,
      JSON.stringify(s),
      now
    ).run();
  } catch (e: any) {
    console.warn('[Vote4K D1 Save Warning]:', e?.message || e);
  }
}

export function checkAndAdvanceStage(currentState: Vote4KSeason): Vote4KSeason {
  const now = Date.now();
  let modified = false;

  let loopCount = 0;
  while (loopCount < 10) {
    loopCount++;

    if (currentState.stage === 'suggestions') {
      const isTimeOver = now >= currentState.stageEndTime;

      if (isTimeOver) {
        // Transition from suggestions to voting after 2 days
        // Pick Top 5 by votes
        const sorted = [...(currentState.suggestions || [])].sort((a, b) => b.votes - a.votes);
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
        const sortedCandidates = [...(currentState.finalCandidates || [])].sort(
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
        // Transition from cooldown to new suggestions season
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

  return currentState;
}

export async function getVote4KState(db?: any): Promise<Vote4KSeason> {
  let current: Vote4KSeason | null = null;

  if (db) {
    current = await loadFromD1(db);
  }

  if (!current) {
    current = loadFromFile();
    if (db) {
      await saveToD1(db, current);
    }
  }

  const advanced = checkAndAdvanceStage(current);
  saveToFile(advanced);
  if (db) {
    await saveToD1(db, advanced);
  }

  return advanced;
}

export async function suggestAnimeFor4K(params: {
  animeId: string;
  title: string;
  originalName?: string;
  image: string;
  year?: string | number;
  genres?: string[];
  userEmail: string;
  userName: string;
  userAvatar?: string;
}, db?: any): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
  const current = await getVote4KState(db);

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

  if (!current.suggestions) {
    current.suggestions = [];
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
  saveToFile(updated);
  if (db) {
    await saveToD1(db, updated);
  }

  return {
    success: true,
    message: existing ? 'Голос за предложенный тайтл добавлен!' : 'Тайтл успешно предложен на 4K!',
    state: updated
  };
}

export async function upvoteSuggestion(
  suggestionId: string,
  userEmail: string,
  db?: any
): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
  const current = await getVote4KState(db);

  if (current.stage !== 'suggestions') {
    return {
      success: false,
      message: 'Голосование за предложения сейчас закрыто.',
      state: current
    };
  }

  const sug = (current.suggestions || []).find((s) => s.id === suggestionId || s.animeId === suggestionId);
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
  saveToFile(updated);
  if (db) {
    await saveToD1(db, updated);
  }

  return {
    success: true,
    message: 'Ваш голос обновлен!',
    state: updated
  };
}

export async function voteFinalCandidate(
  candidateId: string,
  userEmail: string,
  db?: any
): Promise<{ success: boolean; message: string; state: Vote4KSeason }> {
  const current = await getVote4KState(db);

  if (current.stage !== 'voting') {
    return {
      success: false,
      message: 'Финальное голосование сейчас не активно.',
      state: current
    };
  }

  const voterId = userEmail || 'anonymous';

  // Remove previous vote from any candidate
  (current.finalCandidates || []).forEach((c) => {
    if (c.voters.includes(voterId)) {
      c.voters = c.voters.filter((v) => v !== voterId);
      c.votes = Math.max(0, c.votes - 1);
    }
  });

  // Find candidate and cast vote
  const target = (current.finalCandidates || []).find((c) => c.id === candidateId || c.animeId === candidateId);
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
  saveToFile(updated);
  if (db) {
    await saveToD1(db, updated);
  }

  return {
    success: true,
    message: `Вы успешно проголосовали за «${target.title}»!`,
    state: updated
  };
}
