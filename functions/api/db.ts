interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // 1. Get Profile
    if (action === 'getProfile') {
      const id = url.searchParams.get('id');
      const email = url.searchParams.get('email');
      
      let profile;
      if (id) {
        profile = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(id).first();
      } else if (email) {
        profile = await env.DB.prepare("SELECT * FROM profiles WHERE email = ?").bind(email).first();
      }
      
      return new Response(JSON.stringify(profile), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Get Forum Topics
    if (action === 'getForumTopics') {
      const category = url.searchParams.get('category');
      let query = "SELECT t.*, p.name as author_name, p.avatar as author_avatar FROM forum_topics t LEFT JOIN profiles p ON t.author_id = p.id";
      let topics;
      
      if (category) {
        topics = await env.DB.prepare(query + " WHERE t.category = ? ORDER BY t.created_at DESC").bind(category).all();
      } else {
        topics = await env.DB.prepare(query + " ORDER BY t.created_at DESC").all();
      }
      
      return new Response(JSON.stringify(topics.results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Get Forum Posts
    if (action === 'getForumPosts') {
      const topicId = url.searchParams.get('topicId');
      if (!topicId) return new Response('topicId required', { status: 400 });
      
      const posts = await env.DB.prepare(
        "SELECT p.*, pr.name as author_name, pr.avatar as author_avatar FROM forum_posts p LEFT JOIN profiles pr ON p.author_id = pr.id WHERE p.topic_id = ? ORDER BY p.created_at ASC"
      ).bind(topicId).all();
      
      return new Response(JSON.stringify(posts.results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Get Clubs
    if (action === 'getClubs') {
      const clubs = await env.DB.prepare("SELECT * FROM clubs ORDER BY created_at DESC").all();
      return new Response(JSON.stringify(clubs.results), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 5. Create Forum Topic (POST)
    if (request.method === 'POST' && action === 'createTopic') {
      const body: any = await request.json();
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO forum_topics (id, author_id, title, content, category, anime_id) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(id, body.authorId, body.title, body.content, body.category, body.animeId).run();
      
      return new Response(JSON.stringify({ id }), { status: 201 });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
