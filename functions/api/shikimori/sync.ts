const CLIENT_ID = 'kI3V5SN4EtzP_DaAjykHoXVdJJVCe2XPW-q0qiDcmig';
const CLIENT_SECRET = 'RtVc_GWgelNy3tWLLLCyEfKE5C6OK_u52SrK9unWQRU';

const STATUS_MAP: Record<string, string> = {
  'watching': 'watching',
  'watched': 'completed',
  'dropped': 'dropped',
  'planned': 'planned'
};

async function refreshToken(db: any, email: string, refreshTokenStr: string) {
  const tokenParams = new URLSearchParams();
  tokenParams.append('grant_type', 'refresh_token');
  tokenParams.append('client_id', CLIENT_ID);
  tokenParams.append('client_secret', CLIENT_SECRET);
  tokenParams.append('refresh_token', refreshTokenStr);

  const tokenRes = await fetch('https://shikimori.one/oauth/token', {
    method: 'POST',
    headers: {
      'User-Agent': 'KamiAnime Sync',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: tokenParams
  });

  if (!tokenRes.ok) {
    throw new Error('Failed to refresh token: ' + await tokenRes.text());
  }

  const tokenData = await tokenRes.json() as any;
  const newAccessToken = tokenData.access_token;
  const newRefreshToken = tokenData.refresh_token || refreshTokenStr;

  await db.prepare('UPDATE profiles SET shikimori_token = ?, shikimori_refresh_token = ? WHERE email = ?')
    .bind(newAccessToken, newRefreshToken, email)
    .run();

  return newAccessToken;
}

export const onRequestPost = async (context: any) => {
  const { request, env } = context;
  try {
    const { email, animeId, status, episodes, score } = await request.json();
    if (!email || !animeId) {
      return Response.json({ error: 'Missing email or animeId' }, { status: 400 });
    }

    const { results } = await env.DB.prepare('SELECT shikimori_token, shikimori_refresh_token, shikimori_id FROM profiles WHERE email = ?').bind(email).all();
    if (!results || results.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = results[0];
    if (!profile.shikimori_token || !profile.shikimori_id) {
      return Response.json({ error: 'Shikimori integration not linked' }, { status: 400 });
    }

    let accessToken = profile.shikimori_token;
    const userId = profile.shikimori_id;
    const mappedStatus = STATUS_MAP[status];

    const executeUpdate = async (token: string) => {
      // 1. Get existing rate or create a new one
      let method = 'POST';
      let endpoint = 'https://shikimori.one/api/v2/user_rates';
      
      const payload: any = {
        user_rate: {
          user_id: userId,
          target_id: animeId,
          target_type: 'Anime',
        }
      };

      if (mappedStatus) payload.user_rate.status = mappedStatus;
      if (episodes !== undefined) payload.user_rate.episodes = episodes;
      if (score !== undefined) payload.user_rate.score = score;

      const rateRes = await fetch(endpoint, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'KamiAnime Sync',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // User rate exists? We need to use POST to create it. If it returns 422 (already exists maybe?), we need to PUT to /api/v2/user_rates/:id
      // Shikimori API docs: POST /api/v2/user_rates - creates. If error because exists, we should find it first.
      
      return rateRes;
    };

    let rateRes = await executeUpdate(accessToken);

    // Unprocessable Entity indicating it already might exist
    if (rateRes.status === 422) {
      // Fetch the existing user rate ID for this anime and user
      const findRes = await fetch(`https://shikimori.one/api/v2/user_rates?user_id=${userId}&target_id=${animeId}&target_type=Anime`, {
         headers: {
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'KamiAnime Sync',
         }
      });
      if (findRes.status === 401) {
         accessToken = await refreshToken(env.DB, email, profile.shikimori_refresh_token);
         rateRes = await executeUpdate(accessToken);
      } else if (findRes.ok) {
         const existingRates = await findRes.json() as any[];
         if (existingRates.length > 0) {
            const rateId = existingRates[0].id;
             const payload: any = { user_rate: {} };
             if (mappedStatus) payload.user_rate.status = mappedStatus;
             if (episodes !== undefined) payload.user_rate.episodes = episodes;
             if (score !== undefined) payload.user_rate.score = score;

             rateRes = await fetch(`https://shikimori.one/api/v2/user_rates/${rateId}`, {
               method: 'PUT',
               headers: {
                 'Authorization': `Bearer ${accessToken}`,
                 'User-Agent': 'KamiAnime Sync',
                 'Content-Type': 'application/json'
               },
               body: JSON.stringify(payload)
             });
         }
      }
    }

    if (rateRes.status === 401) {
      // Try refresh
      accessToken = await refreshToken(env.DB, email, profile.shikimori_refresh_token);
      rateRes = await executeUpdate(accessToken);
    }

    if (!rateRes.ok) {
      return Response.json({ error: 'Failed to sync to Shikimori: ' + await rateRes.text() }, { status: rateRes.status });
    }

    return Response.json({ success: true, data: await rateRes.json() });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
