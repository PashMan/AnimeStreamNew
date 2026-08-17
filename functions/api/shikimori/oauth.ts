const CLIENT_ID = 'kI3V5SN4EtzP_DaAjykHoXVdJJVCe2XPW-q0qiDcmig';
const CLIENT_SECRET = 'RtVc_GWgelNy3tWLLLCyEfKE5C6OK_u52SrK9unWQRU'; // Never expose to client

export const onRequestPost = async (context: any) => {
  const { request, env } = context;
  try {
    const { code, email, redirectUri } = await request.json();
    if (!code || !email) {
      return Response.json({ error: 'Missing code or email' }, { status: 400 });
    }

    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('client_id', CLIENT_ID);
    tokenParams.append('client_secret', CLIENT_SECRET);
    tokenParams.append('code', code);
    // Use the redirect_uri that was used via frontend auth or fallback to origin/profile
    tokenParams.append('redirect_uri', redirectUri || (new URL(request.url).origin + '/profile'));

    const tokenRes = await fetch('https://shikimori.one/oauth/token', {
      method: 'POST',
      headers: {
        'User-Agent': 'KamiAnime Sync',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      return Response.json({ error: 'Failed to exchange token: ' + errorText }, { status: 400 });
    }

    const tokenData = await tokenRes.json() as any;

    // Get the Shikimori user ID
    const userRes = await fetch('https://shikimori.one/api/users/whoami', {
      headers: {
        'User-Agent': 'KamiAnime Sync',
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    if (!userRes.ok) {
       return Response.json({ error: 'Failed to fetch user data' }, { status: 400 });
    }

    const userData = await userRes.json() as any;

    // Save tokens and IDs in DB securely
    try {
      await env.DB.prepare(
        'UPDATE profiles SET shikimori_token = ?, shikimori_refresh_token = ?, shikimori_id = ? WHERE email = ?'
      )
      .bind(tokenData.access_token, tokenData.refresh_token, String(userData.id), email)
      .run();
    } catch (dbError: any) {
      // Auto-migrate if columns don't exist
      if (dbError.message && dbError.message.includes('shikimori')) {
         try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN shikimori_token TEXT').run(); } catch(e){}
         try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN shikimori_refresh_token TEXT').run(); } catch(e){}
         try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN shikimori_id TEXT').run(); } catch(e){}
         
         await env.DB.prepare(
           'UPDATE profiles SET shikimori_token = ?, shikimori_refresh_token = ?, shikimori_id = ? WHERE email = ?'
         )
         .bind(tokenData.access_token, tokenData.refresh_token, String(userData.id), email)
         .run();
      } else {
         throw dbError;
      }
    }

    try {
        // Automatically sync lists on link
        const ratesRes = await fetch(`https://shikimori.one/api/v2/user_rates?user_id=${userData.id}&target_type=Anime&limit=5000`, {
           headers: { 'User-Agent': 'KamiAnime Sync' }
        });

        if (ratesRes.ok) {
           const userRates = await ratesRes.json() as any[];
           try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN watched_anime_ids TEXT').run(); } catch(err) {}
           try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN watching_anime_ids TEXT').run(); } catch(err) {}
           try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN dropped_anime_ids TEXT').run(); } catch(err) {}

           let results;
           try {
             const res = await env.DB.prepare('SELECT watched_anime_ids, watching_anime_ids, dropped_anime_ids FROM profiles WHERE email = ?').bind(email).all();
             results = res.results;
           } catch(e) {
              console.error('Failed to load lists for initial sync', e);
           }
           
           if (results && results.length > 0) {
               const profile = results[0];
               let watchedIds: string[] = profile.watched_anime_ids ? JSON.parse(profile.watched_anime_ids) : [];
               let watchingIds: string[] = profile.watching_anime_ids ? JSON.parse(profile.watching_anime_ids) : [];
               let droppedIds: string[] = profile.dropped_anime_ids ? JSON.parse(profile.dropped_anime_ids) : [];

               const watchedSet = new Set(watchedIds);
               const watchingSet = new Set(watchingIds);
               const droppedSet = new Set(droppedIds);

               for (const rate of userRates) {
                  const animeId = String(rate.target_id);
                  const status = rate.status;

                  watchedSet.delete(animeId);
                  watchingSet.delete(animeId);
                  droppedSet.delete(animeId);

                  if (status === 'completed') watchedSet.add(animeId);
                  if (status === 'watching') watchingSet.add(animeId);
                  if (status === 'dropped') droppedSet.add(animeId);
               }

               await env.DB.prepare('UPDATE profiles SET watched_anime_ids = ?, watching_anime_ids = ?, dropped_anime_ids = ? WHERE email = ?')
                 .bind(JSON.stringify(Array.from(watchedSet)), JSON.stringify(Array.from(watchingSet)), JSON.stringify(Array.from(droppedSet)), email)
                 .run();
           }
        }
    } catch(e) {
        console.error('Initial sync failed', e);
    }

    return Response.json({ success: true, shikimoriId: userData.id, username: userData.nickname });

  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
