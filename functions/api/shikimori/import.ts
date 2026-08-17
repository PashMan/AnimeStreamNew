export const onRequestPost = async (context: any) => {
  const { request, env } = context;
  try {
    const { email } = await request.json();
    if (!email) {
      return Response.json({ error: 'Missing email' }, { status: 400 });
    }

    let results;
    try {
      const res = await env.DB.prepare('SELECT shikimori_id, watched_anime_ids, watching_anime_ids, dropped_anime_ids FROM profiles WHERE email = ?').bind(email).all();
      results = res.results;
    } catch (e: any) {
      // Auto-migrate if columns don't exist
      if (e.message && (e.message.includes('watching_anime_ids') || e.message.includes('watched_anime_ids') || e.message.includes('dropped_anime_ids') || e.message.includes('shikimori_id'))) {
         try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN watched_anime_ids TEXT').run(); } catch(err) {}
         try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN watching_anime_ids TEXT').run(); } catch(err) {}
         try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN dropped_anime_ids TEXT').run(); } catch(err) {}
         try { await env.DB.prepare('ALTER TABLE profiles ADD COLUMN shikimori_id TEXT').run(); } catch(err) {}
         
         const res = await env.DB.prepare('SELECT shikimori_id, watched_anime_ids, watching_anime_ids, dropped_anime_ids FROM profiles WHERE email = ?').bind(email).all();
         results = res.results;
      } else {
         throw e;
      }
    }

    if (!results || results.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = results[0];
    const userId = profile.shikimori_id;
    if (!userId) {
      return Response.json({ error: 'Shikimori integration not linked' }, { status: 400 });
    }

    // Fetch user rates from Shikimori
    const ratesRes = await fetch(`https://shikimori.one/api/v2/user_rates?user_id=${userId}&target_type=Anime&limit=5000`, {
       headers: {
          'User-Agent': 'KamiAnime Sync',
       }
    });

    if (!ratesRes.ok) {
       return Response.json({ error: 'Failed to fetch user rates from Shikimori' }, { status: 400 });
    }

    const userRates = await ratesRes.json() as any[];

    // Parse existing ids if they exist
    let watchedIds: string[] = profile.watched_anime_ids ? JSON.parse(profile.watched_anime_ids) : [];
    let watchingIds: string[] = profile.watching_anime_ids ? JSON.parse(profile.watching_anime_ids) : [];
    let droppedIds: string[] = profile.dropped_anime_ids ? JSON.parse(profile.dropped_anime_ids) : [];

    // Parse the fetched rates and populate sets to ensure uniqueness
    const watchedSet = new Set(watchedIds);
    const watchingSet = new Set(watchingIds);
    const droppedSet = new Set(droppedIds);

    for (const rate of userRates) {
       const animeId = String(rate.target_id);
       const status = rate.status; // 'completed', 'watching', 'dropped', 'planned'

       // Remove from all sets first to ensure we overwrite local status with shiki status if conflicting
       watchedSet.delete(animeId);
       watchingSet.delete(animeId);
       droppedSet.delete(animeId);

       if (status === 'completed') {
          watchedSet.add(animeId);
       } else if (status === 'watching') {
          watchingSet.add(animeId);
       } else if (status === 'dropped') {
          droppedSet.add(animeId);
       }
       // We ignore 'planned' or mapped it if we had a planned list
    }

    const newWatched = Array.from(watchedSet);
    const newWatching = Array.from(watchingSet);
    const newDropped = Array.from(droppedSet);

    await env.DB.prepare('UPDATE profiles SET watched_anime_ids = ?, watching_anime_ids = ?, dropped_anime_ids = ? WHERE email = ?')
      .bind(JSON.stringify(newWatched), JSON.stringify(newWatching), JSON.stringify(newDropped), email)
      .run();

    return Response.json({ success: true, watched: newWatched.length, watching: newWatching.length, dropped: newDropped.length });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
};
