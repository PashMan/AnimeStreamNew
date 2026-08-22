// Cloudflare Pages Function for /api/vote4k and /api/vote4k/*
interface Env {
  DB?: D1Database;
}

interface Vote4KSuggestion {
  id: string;
  animeId: string;
  title: string;
  originalName?: string;
  image: string;
  year?: string | number;
  genres?: string[];
  suggestedBy: {
    email: string;
    name: string;
    avatar?: string;
  };
  votes: number;
  voters: string[];
  createdAt: number;
}

interface Vote4KFinalCandidate {
  id: string;
  animeId: string;
  title: string;
  originalName?: string;
  image: string;
  year?: string | number;
  genres?: string[];
  votes: number;
  voters: string[];
}

interface Vote4KSeason {
  seasonNumber: number;
  stage: 'suggestions' | 'voting' | 'winner' | 'cooldown';
  cycleStartTime: number;
  stageStartTime: number;
  stageEndTime: number;
  suggestions: Vote4KSuggestion[];
  finalCandidates: Vote4KFinalCandidate[];
  winner: Vote4KFinalCandidate | null;
  historyWinners: Array<{
    seasonNumber: number;
    winner: Vote4KFinalCandidate;
    endedAt: number;
  }>;
}

const STAGE_SUGGESTIONS_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
const STAGE_VOTING_MS = 3 * 24 * 60 * 60 * 1000;      // 3 days
const STAGE_WINNER_MS = 2 * 24 * 60 * 60 * 1000;      // 2 days
const STAGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;    // 7 days

async function initD1(db: any): Promise<void> {
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
    suggestions: [],
    finalCandidates: [],
    winner: null,
    historyWinners: []
  };
}

function checkAndAdvanceStage(currentState: Vote4KSeason): Vote4KSeason {
  const now = Date.now();
  let loopCount = 0;

  while (loopCount < 10) {
    loopCount++;

    if (currentState.stage === 'suggestions') {
      if (now >= currentState.stageEndTime) {
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
        continue;
      }
      break;
    }

    if (currentState.stage === 'voting') {
      if (now >= currentState.stageEndTime) {
        const sorted = [...(currentState.finalCandidates || [])].sort((a, b) => b.votes - a.votes);
        const winningCandidate = sorted[0] || null;

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
        continue;
      }
      break;
    }

    if (currentState.stage === 'winner') {
      if (now >= currentState.stageEndTime) {
        currentState.stage = 'cooldown';
        currentState.stageStartTime = now;
        currentState.stageEndTime = now + STAGE_COOLDOWN_MS;
        continue;
      }
      break;
    }

    if (currentState.stage === 'cooldown') {
      if (now >= currentState.stageEndTime) {
        currentState.seasonNumber += 1;
        currentState.stage = 'suggestions';
        currentState.suggestions = [];
        currentState.finalCandidates = [];
        currentState.winner = null;
        currentState.cycleStartTime = now;
        currentState.stageStartTime = now;
        currentState.stageEndTime = now + STAGE_SUGGESTIONS_MS;
        continue;
      }
      break;
    }

    break;
  }

  return currentState;
}

async function getStateFromDB(db: any): Promise<Vote4KSeason> {
  let state: Vote4KSeason | null = null;
  if (db) {
    try {
      await initD1(db);
      const row = await db.prepare('SELECT data_json FROM vote4k_state WHERE id = ?').bind('active_season').first();
      if (row && row.data_json) {
        state = JSON.parse(row.data_json);
      }
    } catch (e) {
      console.error('[Vote4K DB Error]:', e);
    }
  }

  if (!state) {
    state = createInitialSeason();
  }

  const advanced = checkAndAdvanceStage(state);

  if (db) {
    try {
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
        advanced.seasonNumber,
        advanced.stage,
        advanced.cycleStartTime,
        advanced.stageStartTime,
        advanced.stageEndTime,
        JSON.stringify(advanced),
        now
      ).run();
    } catch (e) {
      console.error('[Vote4K DB Save Error]:', e);
    }
  }

  return advanced;
}

async function saveStateToDB(db: any, state: Vote4KSeason): Promise<Vote4KSeason> {
  const advanced = checkAndAdvanceStage(state);
  if (db) {
    try {
      await initD1(db);
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
        advanced.seasonNumber,
        advanced.stage,
        advanced.cycleStartTime,
        advanced.stageStartTime,
        advanced.stageEndTime,
        JSON.stringify(advanced),
        now
      ).run();
    } catch (e) {
      console.error('[Vote4K DB Save Error]:', e);
    }
  }
  return advanced;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json'
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  const path = url.pathname.replace(/^\/api\/vote4k/, '').replace(/^\//, '');

  try {
    // 1. GET /api/vote4k -> return active season
    if (request.method === 'GET' && (!path || path === '')) {
      const state = await getStateFromDB(env.DB);
      return new Response(JSON.stringify(state), {
        status: 200,
        headers: CORS_HEADERS
      });
    }

    // 2. POST /api/vote4k/suggest -> suggest anime
    if (request.method === 'POST' && (path === 'suggest' || path.endsWith('/suggest'))) {
      const body: any = await request.json();
      const current = await getStateFromDB(env.DB);

      if (current.stage !== 'suggestions') {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Прием предложений сейчас закрыт. Идет другой этап голосования.',
            state: current
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (!body.animeId || !body.title) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Не указан ID или название аниме.',
            state: current
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      if (!current.suggestions) current.suggestions = [];

      const existing = current.suggestions.find(
        (s) => String(s.animeId) === String(body.animeId) || s.title.toLowerCase() === body.title.toLowerCase()
      );

      const voterId = body.userEmail || `anon_${Date.now()}`;

      if (existing) {
        if (!existing.voters.includes(voterId)) {
          existing.voters.push(voterId);
          existing.votes += 1;
        }
      } else {
        const newSug: Vote4KSuggestion = {
          id: `shiki_${body.animeId}`,
          animeId: String(body.animeId),
          title: body.title,
          originalName: body.originalName,
          image: body.image,
          year: body.year,
          genres: body.genres || [],
          suggestedBy: {
            email: body.userEmail,
            name: body.userName || 'Пользователь KamiAnime',
            avatar: body.userAvatar
          },
          votes: 1,
          voters: [voterId],
          createdAt: Date.now()
        };
        current.suggestions.push(newSug);
      }

      const updated = await saveStateToDB(env.DB, current);
      return new Response(
        JSON.stringify({
          success: true,
          message: existing ? 'Голос за предложенный тайтл добавлен!' : 'Тайтл успешно предложен на 4K!',
          state: updated
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 3. POST /api/vote4k/upvote -> upvote suggestion
    if (request.method === 'POST' && (path === 'upvote' || path.endsWith('/upvote'))) {
      const body: any = await request.json();
      const current = await getStateFromDB(env.DB);

      if (current.stage !== 'suggestions') {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Голосование за предложения сейчас закрыто.',
            state: current
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const sug = (current.suggestions || []).find((s) => s.id === body.suggestionId || s.animeId === body.suggestionId);
      if (!sug) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Предложение не найдено.',
            state: current
          }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      const voterId = body.userEmail || 'anonymous';
      if (sug.voters.includes(voterId)) {
        sug.voters = sug.voters.filter((v) => v !== voterId);
        sug.votes = Math.max(0, sug.votes - 1);
      } else {
        sug.voters.push(voterId);
        sug.votes += 1;
      }

      const updated = await saveStateToDB(env.DB, current);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Ваш голос обновлен!',
          state: updated
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // 4. POST /api/vote4k/vote-final -> vote for finalist
    if (request.method === 'POST' && (path === 'vote-final' || path.endsWith('/vote-final'))) {
      const body: any = await request.json();
      const current = await getStateFromDB(env.DB);

      if (current.stage !== 'voting') {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Финальное голосование сейчас не активно.',
            state: current
          }),
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const voterId = body.userEmail || 'anonymous';

      (current.finalCandidates || []).forEach((c) => {
        if (c.voters.includes(voterId)) {
          c.voters = c.voters.filter((v) => v !== voterId);
          c.votes = Math.max(0, c.votes - 1);
        }
      });

      const target = (current.finalCandidates || []).find((c) => c.id === body.candidateId || c.animeId === body.candidateId);
      if (!target) {
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Кандидат не найден среди финалистов.',
            state: current
          }),
          { status: 404, headers: CORS_HEADERS }
        );
      }

      target.voters.push(voterId);
      target.votes += 1;

      const updated = await saveStateToDB(env.DB, current);
      return new Response(
        JSON.stringify({
          success: true,
          message: `Вы успешно проголосовали за «${target.title}»!`,
          state: updated
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: CORS_HEADERS
    });
  } catch (error: any) {
    console.error('[Vote4K Worker Error]:', error);
    return new Response(
      JSON.stringify({
        error: error?.message || 'Internal server error',
        stack: error?.stack
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
