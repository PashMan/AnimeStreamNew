import { User, ForumTopic } from '../types';

class D1DatabaseService {
  private async fetchApi(action: string, params: Record<string, string> = {}) {
    const searchParams = new URLSearchParams({ action, ...params });
    const response = await fetch(`/api/db?${searchParams.toString()}`);
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    return await response.json();
  }

  async getProfileById(id: string): Promise<User | null> {
    try {
      const data = await this.fetchApi('getProfile', { id });
      if (!data) return null;
      return this.mapProfileToUser(data);
    } catch (e) {
      console.error('D1 getProfileById error:', e);
      return null;
    }
  }

  async getProfile(email: string): Promise<User | null> {
    try {
      const data = await this.fetchApi('getProfile', { email });
      if (!data) return null;
      return this.mapProfileToUser(data);
    } catch (e) {
      console.error('D1 getProfile error:', e);
      return null;
    }
  }

  async getForumTopics(category?: string): Promise<ForumTopic[]> {
    try {
      const results = await this.fetchApi('getForumTopics', category ? { category } : {});
      return results.map((d: any) => ({
        id: d.id,
        title: d.title,
        content: d.content,
        author: {
          id: d.author_id,
          name: d.author_name || 'Unknown',
          avatar: d.author_avatar || '',
          email: '' 
        },
        createdAt: d.created_at,
        category: d.category || 'General',
        animeId: d.anime_id,
        views: d.views || 0,
        repliesCount: d.replies_count || 0
      }));
    } catch (e) {
      console.error('D1 getForumTopics error:', e);
      return [];
    }
  }

  async getForumPosts(topicId: string): Promise<any[]> {
    try {
      const results = await this.fetchApi('getForumPosts', { topicId });
      return results.map((d: any) => ({
        id: d.id,
        topicId: d.topic_id,
        content: d.content,
        author: {
          id: d.author_id,
          name: d.author_name || 'Unknown',
          avatar: d.author_avatar || '',
          email: ''
        },
        createdAt: d.created_at
      }));
    } catch (e) {
      console.error('D1 getForumPosts error:', e);
      return [];
    }
  }

  async getClubs(): Promise<any[]> {
    try {
      return await this.fetchApi('getClubs');
    } catch (e) {
      console.error('D1 getClubs error:', e);
      return [];
    }
  }

  // Auth Placeholders (D1 doesn't have built-in auth like Supabase)
  async getSession() {
    return { data: { session: null } };
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }

  async login(credentials: { email: string; password: string }): Promise<User | null> {
    console.warn('Auth is currently disabled during migration');
    return null;
  }

  async register(data: { name: string; email: string; password: string }): Promise<{ user: User | null, message?: string }> {
    return { user: null, message: 'Регистрация временно недоступна' };
  }

  async logout() {}

  async loginWithGoogle() {}

  async resetPassword(email: string) {
    return { success: false, message: 'Сброс пароля временно недоступен' };
  }

  async updateProfile(email: string, updates: Partial<User>): Promise<User | null> {
    return null;
  }

  private mapProfileToUser(p: any): User {
    return {
      id: p.id,
      name: p.name || 'Пользователь',
      email: p.email,
      avatar: p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.email || p.id}`,
      isPremium: Boolean(p.is_premium),
      premiumUntil: p.premium_until,
      bio: p.bio,
      watchedTime: p.watched_time || 0,
      episodesWatched: p.episodes_watched || 0,
      friends: JSON.parse(p.friends || '[]'),
      watchedAnimeIds: JSON.parse(p.watched_anime_ids || '[]'),
      watchingAnimeIds: [],
      droppedAnimeIds: [],
      profileBg: p.profile_bg,
      profileBanner: p.profile_banner,
      profileLayout: p.profile_layout || 'standard',
      themeColor: p.theme_color,
      avatarShape: p.avatar_shape || 'circle',
      cardOpacity: p.card_opacity,
      cardBlur: p.card_blur,
      lastSeen: p.last_seen,
      role: p.role || 'user'
    };
  }
}

export const db = new D1DatabaseService();
