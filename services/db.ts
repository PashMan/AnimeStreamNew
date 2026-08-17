import { createClient } from '@supabase/supabase-js';
import { 
  Anime, 
  User, 
  Comment, 
  ChatMessage, 
  PrivateMessage, 
  ForumTopic, 
  ForumPost, 
  Review,
  Club,
  ClubMember,
  ClubMessage,
  CommunityCollection,
  CommunityCollectionItem
} from '../types';
import { containsProfanity } from '../utils/profanity';


// Use environment variables or fallback to the key you provided
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://ulumbarwutnsodmzxpst.supabase.co';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsdW1iYXJ3dXRuc29kbXp4cHN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3MDA5ODIsImV4cCI6MjA4NzI3Njk4Mn0.4HTww4JB9dcc9FcyONURPsdcu4CAdKzScsshAj3lJxs';

let supabaseClient: any = null;
console.log('Initializing Supabase with URL:', supabaseUrl);
console.log('Supabase Key present:', supabaseKey !== 'placeholder' && !!supabaseKey);

// Memory storage for Supabase auth to avoid localStorage DOMException
const memoryStorage = {
    getItem: (key: string) => null,
    setItem: (key: string, value: string) => {},
    removeItem: (key: string) => {},
};

try {
  if (supabaseUrl && supabaseKey && supabaseKey !== 'placeholder') {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: memoryStorage,
        persistSession: false,
      },
    });
    console.log('Supabase client created successfully with memory storage');
  } else {
    console.warn('Supabase client NOT created: URL or Key is missing/placeholder');
    // Create a dummy object so D1 methods can still be attached
    supabaseClient = {
      auth: {
        signInWithPassword: async () => ({ error: { message: 'Auth disabled' } }),
        signUp: async () => ({ error: { message: 'Auth disabled' } }),
        signOut: async () => ({ error: null }),
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      },
      storage: {
        from: () => ({
          upload: async () => ({ error: { message: 'Storage disabled' } }),
          getPublicUrl: () => ({ data: { publicUrl: '' } })
        })
      }
    };
  }
} catch (e) {
  console.error('Supabase initialization failed:', e);
  supabaseClient = { auth: {}, storage: {} };
}

// --- D1 Migration: Override Database Methods ---
class D1QueryBuilder {
  table: string;
  action: string = 'select';
  cols: string = '*';
  wheres: any[] = [];
  orders: any[] = [];
  lim: number | null = null;
  payload: any = null;
  isSingle: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(cols = '*') { 
    if (this.action !== 'insert' && this.action !== 'update' && this.action !== 'delete' && this.action !== 'rpc') {
      this.action = 'select'; 
    }
    this.cols = cols; 
    return this; 
  }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  
  eq(col: string, val: any) { this.wheres.push({ col, op: '=', val }); return this; }
  neq(col: string, val: any) { this.wheres.push({ col, op: '!=', val }); return this; }
  ilike(col: string, val: any) { this.wheres.push({ col, op: 'ILIKE', val }); return this; }
  in(col: string, vals: any[]) { this.wheres.push({ col, op: 'IN', val: vals }); return this; }
  or(condition: string) { this.wheres.push({ col: 'OR', op: 'OR', val: condition }); return this; }
  
  order(col: string, { ascending = true } = {}) { this.orders.push({ col, ascending }); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.isSingle = true; return this; }
  
  rpc(params: any) { this.action = 'rpc'; this.payload = params; return this; }

  async then(resolve: any, reject: any) {
    try {
      const res = await fetch('/api/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          cols: this.cols,
          wheres: this.wheres,
          orders: this.orders,
          limit: this.lim,
          payload: this.payload,
          isSingle: this.isSingle
        })
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const result = await res.json();
      resolve(result);
    } catch (e) {
      if (reject) reject({ data: null, error: e });
      else console.error("D1 Query Error:", e);
    }
  }
}

// Override Supabase DB methods to use Cloudflare D1
if (supabaseClient) {
  supabaseClient.from = (table: string) => new D1QueryBuilder(table);
  supabaseClient.rpc = (fn: string, params: any) => new D1QueryBuilder(fn).rpc(params);
}
// -----------------------------------------------

class DatabaseService {
  private isSupabaseAvailable(): boolean {
    // We are now using D1 via API, so the database is always available
    return true;
  }

  // Auth
  async login(credentials: { email: string; password: string }): Promise<User | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      // 1. Try Supabase Auth Login
      const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (authError) {
        console.error('Supabase Auth Login Error:', authError.message);
        return null;
      }

      if (!authData.user) return null;

      // 2. Fetch Profile
      let { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('email', credentials.email)
        .single();
      
      if (error || !data) {
        console.warn('Profile not found in D1, creating one for existing Supabase user');
        const newProfile = {
          id: authData.user.id,
          email: credentials.email,
          name: authData.user.user_metadata?.name || credentials.email.split('@')[0],
          avatar: authData.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${credentials.email.split('@')[0]}`
        };
        await supabaseClient.from('profiles').insert([newProfile]);
        data = newProfile;
      }
      
      return this.mapProfileToUser(data);
    } catch (e) {
      console.error('Login exception:', e);
      return null;
    }
  }

  // Auth Helpers
  async getSession() {
      return await supabaseClient.auth.getSession();
  }

  onAuthStateChange(callback: (event: string, session: any) => void) {
      return supabaseClient.auth.onAuthStateChange((event: string, session: any) => {
          callback(event, session);
      });
  }

  async getProfile(email: string): Promise<User | null> {
      let { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();
      
      if (error || !data) {
        // If not found, check if there's a logged in user with this email
        const { data: authData } = await supabaseClient.auth.getUser();
        if (authData.user && authData.user.email === email) {
           console.warn('Profile not found in D1, creating one for existing Supabase user');
           const newProfile = {
             id: authData.user.id,
             email: email,
             name: authData.user.user_metadata?.name || email.split('@')[0],
             avatar: authData.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${email.split('@')[0]}`
           };
           await supabaseClient.from('profiles').insert([newProfile]);
           data = newProfile;
        } else {
           return null;
        }
      }

      return this.mapProfileToUser(data);
  }

  async getProfileById(id: string): Promise<User | null> {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error || !data) return null;
      return this.mapProfileToUser(data);
  }

  async getProfileByName(name: string): Promise<User | null> {
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .ilike('name', name)
        .single();
      
      if (error || !data) return null;
      return this.mapProfileToUser(data);
  }

  async getAllUsers(): Promise<User[]> {
      if (!this.isSupabaseAvailable()) return [];
      const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error || !data) return [];
      return data.map((p: any) => this.mapProfileToUser(p)).filter(Boolean) as User[];
  }

  private translateError(message: string): string {
    if (message.includes('User already registered')) return 'Пользователь с таким email уже зарегистрирован';
    if (message.includes('database error saving new user')) return 'Этот email уже занят или произошла ошибка базы данных';
    if (message.includes('Invalid login credentials')) return 'Неверный email или пароль';
    if (message.includes('Email not confirmed')) return 'Email не подтвержден';
    return message;
  }

  async register(data: { name: string; email: string; password: string }): Promise<{ user: User | null, message?: string }> {
    if (!this.isSupabaseAvailable()) return { user: null, message: 'База данных недоступна' };
    try {
      // Check if email already exists in profiles
      const existingProfile = await this.getProfile(data.email);
      if (existingProfile) {
        return { user: null, message: 'Пользователь с таким email уже зарегистрирован' };
      }

      // 1. Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabaseClient.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.name}`
          }
        }
      });

      if (authError) {
        console.error('Supabase Auth Register Error:', authError.message);
        return { user: null, message: this.translateError(authError.message) };
      }

      if (authData.user && !authData.session) {
        // Email confirmation required
        return { user: null, message: 'Confirmation email sent' };
      }

      if (!authData.user) return { user: null, message: 'Registration failed' };

      // Create profile in D1 explicitly
      const newProfile: any = {
        id: authData.user.id,
        email: data.email,
        name: data.name,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.name}`
      };
      
      await supabaseClient.from('profiles').insert([newProfile]);

      return { user: this.mapProfileToUser(newProfile) };

    } catch (e) {
      console.error('Registration exception:', e);
      return { user: null, message: 'Exception occurred' };
    }
  }

  async logout() {
      if (this.isSupabaseAvailable()) {
          await supabaseClient.auth.signOut();
      }
  }

  async loginWithGoogle(): Promise<{ success: boolean; message?: string }> {
    if (!this.isSupabaseAvailable()) return { success: false, message: 'Database unavailable' };
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) return { success: false, message: error.message };
      return { success: true };
    } catch (e) {
      console.error('Google login exception:', e);
      return { success: false, message: 'Exception occurred' };
    }
  }

  async resetPassword(email: string): Promise<{ success: boolean; message?: string }> {
    if (!this.isSupabaseAvailable()) return { success: false, message: 'Database unavailable' };
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: 'Check your email for the password reset link' };
    } catch (e) {
      console.error('Reset password exception:', e);
      return { success: false, message: 'Exception occurred' };
    }
  }

  private safeParseObject(val: any): Record<string, any> {
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) return val;
    if (typeof val === 'string') {
        try {
            const parsed = JSON.parse(val);
            return (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch { return {}; }
    }
    return {};
  }

  private safeParseArray(val: any): any[] {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  private mapProfileToUser(p: any): User | null {
    if (!p) return null;
    let name = p.name;
    // If name looks like a UUID or is missing, use email prefix
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!name || uuidRegex.test(name)) {
      if (p.email && p.email.includes('@')) {
        name = p.email.split('@')[0];
      } else {
        name = 'Пользователь';
      }
    }

    return {
      id: p.id,
      name: name,
      email: p.email,
      avatar: p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.email || p.id}`,
      isPremium: p.is_premium,
      premiumUntil: p.premium_until,
      bio: p.bio,
      watchedTime: p.watched_time,
      episodesWatched: p.episodes_watched,
      friends: this.safeParseArray(p.friends),
      watchedAnimeIds: this.safeParseArray(p.watched_anime_ids),
      watchingAnimeIds: this.safeParseArray(p.watching_anime_ids),
      droppedAnimeIds: this.safeParseArray(p.dropped_anime_ids),
      profileBg: p.profile_bg,
      profileBanner: p.profile_banner,
      profileLayout: p.profile_layout as any,
      profileBlocks: this.safeParseArray(p.profile_blocks),
      profilePositions: this.safeParseObject(p.profile_positions),
      textColor: p.text_color,
      themeColor: p.theme_color,
      avatarShape: p.avatar_shape as any,
      cardOpacity: p.card_opacity,
      cardBlur: p.card_blur,
      cardBg: p.card_bg,
      lastSeen: p.last_seen,
      role: p.is_admin ? 'admin' : (p.role || 'user'),
      isBanned: p.is_banned || false,
      isMuted: p.is_muted || false,
      shikimoriId: p.shikimori_id,
      // shikimoriToken and shikimoriRefreshToken are intentionally omitted 
      // from the client payload for security reasons.
    };
  }

  async updateLastSeen(email: string) {
    if (!this.isSupabaseAvailable()) return;
    try {
      await supabaseClient
        .from('profiles')
        .update({ last_seen: new Date().toISOString() })
        .eq('email', email);
    } catch (e) {
      // Ignore errors for background updates
    }
  }

  async updateProfile(email: string, updates: Partial<User>): Promise<User | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const mapped: any = {};
      if (updates.name) {
        // Check uniqueness
        const { data: existing } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('name', updates.name)
          .neq('email', email) // Exclude self
          .single();
        
        if (existing) {
          throw new Error('Username already taken');
        }
        mapped.name = updates.name;
      }
      if (updates.avatar) mapped.avatar = updates.avatar;
      if (updates.bio !== undefined) mapped.bio = updates.bio;
      if (updates.isPremium !== undefined) mapped.is_premium = updates.isPremium;
      if (updates.episodesWatched !== undefined) mapped.episodes_watched = updates.episodesWatched;
      if (updates.watchedTime !== undefined) mapped.watched_time = updates.watchedTime;
      if (updates.watchedAnimeIds) mapped.watched_anime_ids = JSON.stringify(updates.watchedAnimeIds);
      if (updates.watchingAnimeIds) mapped.watching_anime_ids = JSON.stringify(updates.watchingAnimeIds);
      if (updates.droppedAnimeIds) mapped.dropped_anime_ids = JSON.stringify(updates.droppedAnimeIds);
      if (updates.profileBg !== undefined) mapped.profile_bg = updates.profileBg;
      if (updates.profileBanner !== undefined) mapped.profile_banner = updates.profileBanner;
      if (updates.profileLayout !== undefined) mapped.profile_layout = updates.profileLayout;
      if (updates.themeColor !== undefined) mapped.theme_color = updates.themeColor;
      if (updates.avatarShape !== undefined) mapped.avatar_shape = updates.avatarShape;
      if (updates.cardOpacity !== undefined) mapped.card_opacity = updates.cardOpacity;
      if (updates.cardBlur !== undefined) mapped.card_blur = updates.cardBlur;
      if (updates.cardBg !== undefined) mapped.card_bg = updates.cardBg;
      if (updates.textColor !== undefined) mapped.text_color = updates.textColor;
      if (updates.profileBlocks !== undefined) mapped.profile_blocks = JSON.stringify(updates.profileBlocks);
      if (updates.profilePositions !== undefined) mapped.profile_positions = JSON.stringify(updates.profilePositions);
      if (updates.friends !== undefined) mapped.friends = JSON.stringify(updates.friends);
      if (updates.shikimoriToken !== undefined) mapped.shikimori_token = updates.shikimoriToken;
      if (updates.shikimoriRefreshToken !== undefined) mapped.shikimori_refresh_token = updates.shikimoriRefreshToken;
      if (updates.shikimoriId !== undefined) mapped.shikimori_id = updates.shikimoriId;

      console.log('DEBUG: Updating profile with payload:', mapped);

      // Try full update first
      let result = await supabaseClient
        .from('profiles')
        .update(mapped)
        .eq('email', email)
        .select()
        .single();
      
      // If error (likely missing column), try fallback to basic fields
      if (result.error) {
        console.warn('Full profile update failed, trying fallback:', result.error.message);
        
        const basicMapped: any = {};
        if (updates.name) basicMapped.name = updates.name;
        if (updates.avatar) basicMapped.avatar = updates.avatar;
        if (updates.bio !== undefined) basicMapped.bio = updates.bio;
        if (updates.friends !== undefined) basicMapped.friends = JSON.stringify(updates.friends);
        if (updates.watchedAnimeIds) basicMapped.watched_anime_ids = JSON.stringify(updates.watchedAnimeIds);
        if (updates.shikimoriToken !== undefined) basicMapped.shikimori_token = updates.shikimoriToken;
        if (updates.shikimoriRefreshToken !== undefined) basicMapped.shikimori_refresh_token = updates.shikimoriRefreshToken;
        if (updates.shikimoriId !== undefined) basicMapped.shikimori_id = updates.shikimoriId;

        // Only include columns that exist in the schema cache or try one by one if needed
        // For now, just try a very basic update if the first one failed
        result = await supabaseClient
          .from('profiles')
          .update(basicMapped)
          .eq('email', email)
          .select()
          .single();
      }
      
      const { data, error } = result;
      
      if (error) {
        console.error('Profile update error:', error);
        return null;
      }
      
      if (!data) return null;
      return this.mapProfileToUser(data);
    } catch (e) {
      if (e instanceof Error && e.message === 'Username already taken') {
          throw e;
      }
      return null;
    }
  }

  async uploadAvatar(file: File, userId: string): Promise<string | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        console.warn('Storage upload failed (likely RLS), falling back to Base64:', uploadError.message);
        // Fallback to Base64
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
        });
      }

      const { data } = supabaseClient.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (e) {
      console.error('Upload exception:', e);
      // Try Base64 fallback on exception too
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(file);
      });
    }
  }

  // Favorites
  async getFavorites(email: string): Promise<string[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient.from('favorites').select('anime_id').eq('user_email', email);
      return data?.map((d: any) => d.anime_id) || [];
    } catch (e) {
      return [];
    }
  }

  async toggleFavorite(email: string, animeId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    const favs = await this.getFavorites(email);
    const exists = favs.includes(animeId);

    try {
      if (exists) {
        await supabaseClient.from('favorites').delete().eq('user_email', email).eq('anime_id', animeId);
      } else {
        await supabaseClient.from('favorites').insert([{ user_email: email, anime_id: animeId }]);
      }
      return !exists;
    } catch (e) {
      return exists;
    }
  }

  // Watched
  async getWatched(email: string): Promise<string[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient.from('profiles').select('watched_anime_ids').eq('email', email).single();
      return this.safeParseArray(data?.watched_anime_ids);
    } catch (e) {
      return [];
    }
  }

  async toggleWatched(email: string, animeId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    const watched = await this.getWatched(email);
    const exists = watched.includes(animeId);
    let newWatched = [...watched];
    if (exists) newWatched = newWatched.filter(id => id !== animeId);
    else newWatched.push(animeId);

    const updated = await this.updateProfile(email, { watchedAnimeIds: newWatched });
    return updated ? !exists : exists;
  }

  async setAnimeStatus(email: string, animeId: string, status: 'watched' | 'watching' | 'dropped' | 'planned' | 'none'): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    
    try {
      // Get current profile
      const profile = await this.getProfile(email);
      if (!profile) return false;
      
      let watched = [...(profile.watchedAnimeIds || [])];
      let watching = [...(profile.watchingAnimeIds || [])];
      let dropped = [...(profile.droppedAnimeIds || [])];
      
      // Remove from all first
      watched = watched.filter(id => id !== animeId);
      watching = watching.filter(id => id !== animeId);
      dropped = dropped.filter(id => id !== animeId);
      
      // Also handle favorites (planned)
      const favs = await this.getFavorites(email);
      const isFav = favs.includes(animeId);
      
      if (status === 'planned' && !isFav) {
        await supabaseClient.from('favorites').insert([{ user_email: email, anime_id: animeId }]);
      } else if (status !== 'planned' && isFav) {
        await supabaseClient.from('favorites').delete().eq('user_email', email).eq('anime_id', animeId);
      }
      
      // Add to selected
      if (status === 'watched') watched.push(animeId);
      if (status === 'watching') watching.push(animeId);
      if (status === 'dropped') dropped.push(animeId);
      
      await this.updateProfile(email, {
        watchedAnimeIds: watched,
        watchingAnimeIds: watching,
        droppedAnimeIds: dropped
      });

      // Synchronize with Shikimori (fire-and-forget so it doesn't block UI)
      if (typeof window !== 'undefined') {
        fetch('/api/shikimori/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, animeId, status })
        }).catch(err => {
          console.error('Shikimori sync failed:', err);
        });
      }
      
      return true;
    } catch (e) {
      console.error('Error setting anime status:', e);
      return false;
    }
  }

  // Anime SEO
  async getAnimeSeo(animeId: string): Promise<{ seo_description: string, is_seo_generated: boolean } | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const { data, error } = await supabaseClient
        .from('anime_seo')
        .select('seo_description, is_seo_generated')
        .eq('anime_id', animeId)
        .single();
      
      if (error || !data) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  async saveAnimeSeo(animeId: string, description: string, isGenerated: boolean = true): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      // Upsert logic using delete then insert since D1 proxy might not support ON CONFLICT
      await supabaseClient.from('anime_seo').delete().eq('anime_id', animeId);
      
      const { error } = await supabaseClient.from('anime_seo').insert([{
        anime_id: animeId,
        seo_description: description,
        is_seo_generated: isGenerated,
        updated_at: new Date().toISOString()
      }]);
      
      if (error) {
        console.error('Error saving anime SEO:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Exception saving anime SEO:', e);
      return false;
    }
  }

  // Anime 4K
  async getAnime4k(): Promise<string[]> {
    if (!this.isSupabaseAvailable()) return ['32281', '50594', '38826', '16782'];
    try {
      const { data, error } = await supabaseClient.from('anime_4k').select('anime_id');
      if (error || !data || data.length === 0) {
        // Fallback to hardcoded IDs if table doesn't exist or is empty
        return ['32281', '50594', '38826', '16782'];
      }
      return data.map((d: any) => d.anime_id.toString());
    } catch (e) {
      return ['32281', '50594', '38826', '16782'];
    }
  }

  // Forum
  async getForumTopics(animeId?: string, category?: string, limit: number = 20, excludeCategory?: string, offset: number = 0): Promise<ForumTopic[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      let q = supabaseClient
        .from('forum_topics')
        .select('id, title, content, created_at, category, anime_id, views, replies_count, author_email, profiles(id, name, avatar, email)')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (animeId) q = q.eq('anime_id', animeId);
      if (category) q = q.eq('category', category);
      if (excludeCategory) q = q.neq('category', excludeCategory);
      
      const { data } = await q;
      return data?.map((d: any) => ({
        id: d.id,
        title: d.title,
        content: d.content.length > 200 ? d.content.substring(0, 200) + '...' : d.content, // Truncate content for list view
        author: {
            id: d.profiles?.id,
            name: d.profiles?.name || 'Unknown',
            avatar: d.profiles?.avatar || '',
            email: d.profiles?.email || d.author_email
        },
        createdAt: d.created_at,
        category: d.category || 'General',
        animeId: d.anime_id,
        views: d.views || 0,
        repliesCount: d.replies_count || 0
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async getForumTopic(id: string): Promise<ForumTopic | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const { data } = await supabaseClient
        .from('forum_topics')
        .select('*, profiles(name, avatar, email)')
        .eq('id', id)
        .maybeSingle();
        
      if (!data) return null;
      
      return {
        id: data.id,
        title: data.title,
        content: data.content,
        author: {
            name: data.profiles?.name || 'Unknown',
            avatar: data.profiles?.avatar || '',
            email: data.profiles?.email || data.author_email
        },
        createdAt: data.created_at,
        category: data.category || 'General',
        animeId: data.anime_id,
        views: (data.views || 0) + 1,
        repliesCount: data.replies_count || 0
      };
    } catch (e) {
      return null;
    }
  }

  async createForumTopic(topic: { id?: string, title: string, content: string, author: string, animeId?: string, category: string }): Promise<ForumTopic | null> {
    if (!this.isSupabaseAvailable()) return null;
    
    if (containsProfanity(topic.title) || containsProfanity(topic.content)) {
      throw new Error('Ваше сообщение содержит недопустимые слова.');
    }

    try {
      const payload: any = {
        title: topic.title,
        author_email: topic.author,
        content: topic.content,
        anime_id: topic.animeId,
        category: topic.category
      };
      if (topic.id) payload.id = topic.id;

      const { data, error } = await supabaseClient.from('forum_topics').insert([payload]).select('*, profiles(name, avatar, email)').single();
      
      if (error || !data) return null;
      return {
        id: data.id,
        title: data.title,
        content: data.content,
        author: {
            name: data.profiles?.name || 'Unknown',
            avatar: data.profiles?.avatar || '',
            email: data.profiles?.email || data.author_email
        },
        createdAt: data.created_at,
        category: data.category,
        animeId: data.anime_id,
        views: 0,
        repliesCount: 0
      };
    } catch (e) {
      return null;
    }
  }

  async getForumPosts(topicId: string): Promise<ForumPost[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('forum_posts')
        .select('*, profiles(id, name, avatar, email)')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: true });
        
      return data?.map((d: any) => ({
        id: d.id,
        topicId: d.topic_id,
        parentId: d.parent_id,
        content: d.content,
        author: {
            id: d.profiles?.id,
            name: d.profiles?.name || 'Unknown',
            avatar: d.profiles?.avatar || '',
            email: d.profiles?.email || d.author_email
        },
        createdAt: d.created_at
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async createForumPost(post: { topicId: string, content: string, author: string, parentId?: string }): Promise<ForumPost | null> {
    if (!this.isSupabaseAvailable()) return null;

    if (containsProfanity(post.content)) {
      throw new Error('Ваше сообщение содержит недопустимые слова.');
    }

    try {
      const payload: any = {
        topic_id: post.topicId,
        content: post.content,
        author_email: post.author
      };
      
      // Only add parent_id if it's provided
      if (post.parentId) {
        payload.parent_id = post.parentId;
      }

      // First, insert the post
      let { data, error } = await supabaseClient.from('forum_posts').insert([payload]).select().single();
      
      if (error) {
        // If error is about missing parent_id column, try without it
        if (error.message?.includes('parent_id') || error.code === 'PGRST204') {
          console.warn('parent_id column missing, falling back to top-level post');
          delete payload.parent_id;
          const retry = await supabaseClient.from('forum_posts').insert([payload]).select().single();
          data = retry.data;
          error = retry.error;
        }
      }
      
      if (error || !data) {
        console.error('Forum post insert error:', error);
        return null;
      }
      
      // Increment replies count asynchronously
      supabaseClient.rpc('increment_topic_replies', { topic_id: post.topicId }).then(() => {});

      // Fetch profile separately to be safe
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('name, avatar, email')
        .eq('email', post.author)
        .single();

      return {
        id: data.id,
        topicId: data.topic_id,
        parentId: data.parent_id,
        content: data.content,
        author: {
            name: profile?.name || 'Unknown',
            avatar: profile?.avatar || '',
            email: profile?.email || data.author_email
        },
        createdAt: data.created_at
      };
    } catch (e) {
      return null;
    }
  }

  // Global Chat
  async getGlobalMessages(): Promise<ChatMessage[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('global_messages')
        .select('*, profiles(name, avatar)')
        .order('created_at', { ascending: true })
        .limit(100);
      
      return data?.map((d: any) => ({
        id: d.id,
        user: { name: d.profiles.name, avatar: d.profiles.avatar, email: d.user_email },
        text: d.text,
        timestamp: new Date(d.created_at).getTime()
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async sendGlobalMessage(user: User, text: string): Promise<ChatMessage> {
    if (!this.isSupabaseAvailable()) throw new Error('Database not available');
    try {
      const { data, error } = await supabaseClient
        .from('global_messages')
        .insert([{ user_email: user.email, text }])
        .select('*, profiles(name, avatar)')
        .single();
      
      if (error || !data) throw error;
      return {
        id: data.id,
        user: { name: data.profiles.name, avatar: data.profiles.avatar, email: data.user_email },
        text: data.text,
        timestamp: new Date(data.created_at).getTime()
      };
    } catch (e) {
      throw e;
    }
  }

  // Comments
  async getUserComments(targetId: string): Promise<Comment[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('comments')
        .select('*')
        .eq('target_id', targetId)
        .order('created_at', { ascending: false });
      
      return data?.map((d: any) => ({
        id: d.id,
        user: { name: d.user_name, avatar: d.user_avatar },
        text: d.text,
        date: new Date(d.created_at).toLocaleDateString('ru-RU')
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async addComment(targetId: string, user: User, text: string): Promise<Comment> {
    if (!this.isSupabaseAvailable()) throw new Error('Database not available');

    if (containsProfanity(text)) {
      throw new Error('Ваше сообщение содержит недопустимые слова.');
    }

    try {
      const { data, error } = await supabaseClient
        .from('comments')
        .insert([{
          target_id: targetId,
          user_name: user.name,
          user_avatar: user.avatar,
          text
        }])
        .select()
        .single();
      
      if (error || !data) throw error;
      return {
        id: data.id,
        user: { name: data.user_name, avatar: data.user_avatar },
        text: data.text,
        date: new Date(data.created_at).toLocaleDateString('ru-RU')
      };
    } catch (e) {
      throw e;
    }
  }

  async requestUpscale(userId: string, animeName: string) {
    if (!this.isSupabaseAvailable()) return;
    try {
      await supabaseClient.from('premium_requests').insert([{ user_id: userId, anime_name: animeName, type: 'upscale' }]);
    } catch (e) {}
  }

  // Social & Friends
  // Fetches the most recently registered users
  async getRecentUsers(limit: number = 5): Promise<User[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('profiles')
        .select('id, name, email, avatar, bio, is_premium, episodes_watched, watched_time, created_at, last_seen')
        .limit(limit); // Removed order to avoid full table scan on large tables
      
      return data?.map((p: any) => this.mapProfileToUser(p)) || [];
    } catch (e) {
      return [];
    }
  }

  async searchUsers(query: string): Promise<User[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('profiles')
        .select('id, name, email, avatar, bio, is_premium, episodes_watched, watched_time, last_seen')
        .ilike('name', `%${query}%`)
        .limit(10);
      
      return data?.map((p: any) => this.mapProfileToUser(p)) || [];
    } catch (e) {
      return [];
    }
  }

  async getFriendsList(friendIdentifiers: string[]): Promise<User[]> {
    if (!this.isSupabaseAvailable() || !friendIdentifiers || friendIdentifiers.length === 0) return [];
    try {
      // Filter out any empty strings
      const ids = friendIdentifiers.filter(Boolean);
      if (ids.length === 0) return [];

      // Separate UUIDs and emails to avoid Postgres type mismatch errors
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuids = ids.filter(id => uuidRegex.test(id));
      const emails = ids.filter(id => id.includes('@'));

      const promises = [];

      if (uuids.length > 0) {
        promises.push(
          supabaseClient
            .from('profiles')
            .select('id, name, email, avatar, bio, is_premium, episodes_watched, watched_time, last_seen')
            .in('id', uuids)
        );
      }

      if (emails.length > 0) {
        promises.push(
          supabaseClient
            .from('profiles')
            .select('id, name, email, avatar, bio, is_premium, episodes_watched, watched_time, last_seen')
            .in('email', emails)
        );
      }

      if (promises.length === 0) return [];

      const results = await Promise.all(promises);
      
      const allData = results.flatMap(res => {
        if (res.error) {
          console.error('getFriendsList Supabase error:', res.error);
          return [];
        }
        return res.data || [];
      });

      // Remove duplicates just in case
      const uniqueData = Array.from(new Map(allData.map(item => [item.id, item])).values());
      
      return uniqueData.map((p: any) => this.mapProfileToUser(p)).filter((u): u is User => u !== null);
    } catch (e) {
      console.error('getFriendsList error:', e);
      return [];
    }
  }

  async addFriend(userEmail: string, friendEmail: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      // 1. Get current user's friends
      const user = await this.getProfile(userEmail);
      if (!user) return false;
      
      const currentFriends = user.friends || [];
      if (currentFriends.some((f: string) => f.toLowerCase() === friendEmail.toLowerCase())) return true; // Already friends
      
      const newFriends = [...currentFriends, friendEmail];
      
      // 2. Update user's profile
      await this.updateProfile(userEmail, { friends: newFriends });
      
      // 3. Update friend's profile (mutual friendship)
      const friend = await this.getProfile(friendEmail);
      if (friend) {
          const friendFriends = friend.friends || [];
          if (!friendFriends.some((f: string) => f.toLowerCase() === userEmail.toLowerCase())) {
              await this.updateProfile(friendEmail, { friends: [...friendFriends, userEmail] });
          }
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  async removeFriend(userEmail: string, friendEmail: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const user = await this.getProfile(userEmail);
      if (!user) return false;
      
      const newFriends = (user.friends || []).filter((f: string) => f.toLowerCase() !== friendEmail.toLowerCase());
      await this.updateProfile(userEmail, { friends: newFriends });
      
      // Remove from friend's list too
      const friend = await this.getProfile(friendEmail);
      if (friend) {
          const friendFriends = (friend.friends || []).filter((f: string) => f.toLowerCase() !== userEmail.toLowerCase());
          await this.updateProfile(friendEmail, { friends: friendFriends });
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  // History (Keep local as it's per-device usually, or move to DB if requested)
  async addToHistory(email: string, anime: Anime, ep: number) {
    try {
        const key = `as_history_${email}`;
        const data = localStorage.getItem(key);
        let history = data ? JSON.parse(data) : [];
        history = history.filter((h: any) => h.animeId !== anime.id);
        history.unshift({ animeId: anime.id, title: anime.title, image: anime.image, episode: ep, date: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(history.slice(0, 30)));
    } catch (e) {
        // Ignore storage errors
    }
  }

  async getHistory(email: string): Promise<any[]> {
    try {
        const data = localStorage.getItem(`as_history_${email}`);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
  }

  // Private Messages
  async hasUnreadMessages(email: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { count, error } = await supabaseClient
        .from('private_messages')
        .select('*', { count: 'exact', head: true })
        .eq('to_email', email)
        .eq('is_read', false);
      
      if (error) return false;
      return (count || 0) > 0;
    } catch (e) {
      return false;
    }
  }

  async markMessagesAsRead(userEmail: string, senderEmail: string): Promise<void> {
    if (!this.isSupabaseAvailable()) return;
    try {
      await supabaseClient
        .from('private_messages')
        .update({ is_read: true })
        .eq('to_email', userEmail)
        .eq('from_email', senderEmail)
        .eq('is_read', false);
    } catch (e) {
      console.error('Error marking messages as read:', e);
    }
  }

  async getPrivateMessages(user1: string, user2: string): Promise<PrivateMessage[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('private_messages')
        .select('*')
        .or(`and(from_email.eq.${user1},to_email.eq.${user2}),and(from_email.eq.${user2},to_email.eq.${user1})`)
        .order('created_at', { ascending: false })
        .limit(100); // Limit to last 100 messages for performance
      
      if (data && data.length > 0) {
          // Sort by created_at ascending for chat view
          data.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          // Mark as read if user1 is the recipient
          const unreadIds = data.filter((m: any) => m.to_email === user1 && !m.is_read).map((m: any) => m.id);
          if (unreadIds.length > 0) {
              await supabaseClient.from('private_messages').update({ is_read: true }).in('id', unreadIds);
          }

          return data.map((d: any) => ({
            id: d.id,
            from: d.from_email,
            to: d.to_email,
            text: d.text,
            timestamp: new Date(d.created_at).getTime(),
            isRead: d.is_read
          }));
      }

      return [];
    } catch (e) {
      return [];
    }
  }

  async sendPrivateMessage(from: string, to: string, text: string): Promise<PrivateMessage> {
    if (!this.isSupabaseAvailable()) throw new Error('Database not available');
    try {
      const { data, error } = await supabaseClient
        .from('private_messages')
        .insert([{ from_email: from, to_email: to, text, content: text, is_read: false }])
        .select()
        .single();
      
      if (error || !data) throw error;
      return {
        id: data.id,
        from: data.from_email || from,
        to: data.to_email || to,
        text: data.text || data.content,
        timestamp: new Date(data.created_at).getTime(),
        isRead: data.is_read
      };
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  async getConversations(email: string): Promise<{id: string, email: string, name: string, avatar: string, lastText: string, hasUnread: boolean}[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      // Fetch only the last 100 messages to identify recent conversations
      const { data: messages } = await supabaseClient
        .from('private_messages')
        .select('*')
        .or(`from_email.eq.${email},to_email.eq.${email}`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!messages || messages.length === 0) return [];

      const threadEmails = new Set<string>();
      messages.forEach((m: any) => {
        if (m.from_email === email) threadEmails.add(m.to_email);
        else threadEmails.add(m.from_email);
      });

      const threadEmailsArray = Array.from(threadEmails);
      if (threadEmailsArray.length === 0) return [];

      // Fetch all profiles at once
      const { data: profiles } = await supabaseClient
        .from('profiles')
        .select('id, email, name, avatar, last_seen')
        .in('email', threadEmailsArray);

      const profileMap = new Map<string, any>(profiles?.map((p: any) => [p.email, p]) || []);

      const results = threadEmailsArray.map(tEmail => {
        const u = profileMap.get(tEmail);
        const lastMsg = messages.find((m: any) => (m.from_email === email && m.to_email === tEmail) || (m.from_email === tEmail && m.to_email === email));
        const hasUnread = messages.some((m: any) => m.from_email === tEmail && m.to_email === email && !m.is_read);
        
        let cleanText = lastMsg?.text || '';
        // Strip markdown
        cleanText = cleanText.replace(/(\*\*|__)(.*?)\1/g, '$2'); // Bold
        cleanText = cleanText.replace(/(\*|_)(.*?)\1/g, '$2'); // Italic
        cleanText = cleanText.replace(/~~(.*?)~~/g, '$1'); // Strikethrough
        cleanText = cleanText.replace(/`([^`]+)`/g, '$1'); // Code
        cleanText = cleanText.replace(/^> (.*$)/gm, '$1'); // Blockquote
        cleanText = cleanText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1'); // Link
        cleanText = cleanText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[Image]'); // Image

        return {
          id: (u as any)?.id || '',
          email: tEmail,
          name: (u as any)?.name || 'Unknown',
          avatar: (u as any)?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${tEmail}`,
          lastText: cleanText,
          lastSeen: (u as any)?.last_seen,
          hasUnread
        };
      });

      return results;
    } catch (e) {
      return [];
    }
  }

  // Reviews
  async getAnimeReviews(animeId: string): Promise<Review[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data: reviews, error } = await supabaseClient
        .from('reviews')
        .select(`
          *,
          profiles:user_email (
            name,
            avatar,
            email
          )
        `)
        .eq('anime_id', animeId)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('not found')) {
          return [];
        }
        throw error;
      }

      return (reviews || []).map((r: any) => ({
        id: r.id,
        animeId: r.anime_id,
        user: {
          name: r.profiles?.name || 'Unknown',
          avatar: r.profiles?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.user_email}`,
          email: r.user_email
        },
        content: r.content,
        ratings: {
          plot: r.rating_plot,
          sound: r.rating_sound,
          visuals: r.rating_visuals,
          overall: r.rating_overall
        },
        createdAt: r.created_at
      }));
    } catch (e) {
      console.error('Error fetching reviews:', e);
      return [];
    }
  }

  async addReview(animeId: string, user: User, content: string, ratings: { plot: number; sound: number; visuals: number; overall: number }): Promise<Review | null> {
    if (!this.isSupabaseAvailable()) return null;

    if (containsProfanity(content)) {
      throw new Error('Ваша рецензия содержит недопустимые слова.');
    }

    try {
      const { data, error } = await supabaseClient
        .from('reviews')
        .insert([{
          anime_id: animeId,
          user_email: user.email,
          content: content,
          rating_plot: ratings.plot,
          rating_sound: ratings.sound,
          rating_visuals: ratings.visuals,
          rating_overall: ratings.overall
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding review:', error);
        return null;
      }

      return {
        id: data.id,
        animeId: data.anime_id,
        user: {
          name: user.name,
          avatar: user.avatar,
          email: user.email
        },
        content: data.content,
        ratings: {
          plot: data.rating_plot,
          sound: data.rating_sound,
          visuals: data.rating_visuals,
          overall: data.rating_overall
        },
        createdAt: data.created_at
      };
    } catch (e) {
      console.error('Error adding review:', e);
      return null;
    }
  }

  // Admin & Moderation
  async submitReport(reporterId: string, targetType: 'user' | 'topic' | 'post' | 'comment' | 'review', targetId: string, reason: string, targetContent?: string, targetLink?: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient
        .from('reports')
        .insert([{
          reporter_id: reporterId,
          target_type: targetType,
          target_id: targetId,
          target_content: targetContent,
          target_link: targetLink,
          reason: reason,
          status: 'pending'
        }]);
      return !error;
    } catch (e) {
      console.error('Error submitting report:', e);
      return false;
    }
  }

  async getReports(): Promise<any[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data, error } = await supabaseClient
        .from('reports')
        .select('*, profiles(name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      return (data || []).map((r: any) => ({
        id: r.id,
        reporterId: r.reporter_id,
        reporterName: r.profiles?.name || r.reporter_id,
        targetType: r.target_type,
        targetId: r.target_id,
        targetContent: r.target_content,
        targetLink: r.target_link,
        reason: r.reason,
        createdAt: r.created_at,
        status: r.status
      }));
    } catch (e) {
      console.error('Error fetching reports:', e);
      return [];
    }
  }

  async updateReportStatus(reportId: string, status: 'resolved' | 'dismissed'): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient
        .from('reports')
        .update({ status })
        .eq('id', reportId);
      return !error;
    } catch (e) {
      console.error('Error updating report status:', e);
      return false;
    }
  }

  async deleteReport(reportId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient
        .from('reports')
        .delete()
        .eq('id', reportId);
      return !error;
    } catch (e) {
      console.error('Error deleting report:', e);
      return false;
    }
  }

  async deleteComment(commentId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient.from('comments').delete().eq('id', commentId);
      return !error;
    } catch (e) {
      console.error('Error deleting comment:', e);
      return false;
    }
  }

  async deleteReview(reviewId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient.from('reviews').delete().eq('id', reviewId);
      return !error;
    } catch (e) {
      console.error('Error deleting review:', e);
      return false;
    }
  }

  async deleteForumTopic(topicId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient.from('forum_topics').delete().eq('id', topicId);
      return !error;
    } catch (e) {
      console.error('Error deleting forum topic:', e);
      return false;
    }
  }

  async deleteForumPost(postId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient.from('forum_posts').delete().eq('id', postId);
      return !error;
    } catch (e) {
      console.error('Error deleting forum post:', e);
      return false;
    }
  }

  async deleteTopic(topicId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient.from('forum_topics').delete().eq('id', topicId);
      return !error;
    } catch (e) {
      console.error('Error deleting topic:', e);
      return false;
    }
  }

  async updateUserStatus(email: string, updates: { isBanned?: boolean; bannedUntil?: string; isMuted?: boolean; mutedUntil?: string; role?: 'user' | 'admin' | 'moderator' }): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const dbUpdates: any = {};
      if (updates.isBanned !== undefined) dbUpdates.is_banned = updates.isBanned;
      if (updates.bannedUntil !== undefined) dbUpdates.banned_until = updates.bannedUntil;
      if (updates.isMuted !== undefined) dbUpdates.is_muted = updates.isMuted;
      if (updates.mutedUntil !== undefined) dbUpdates.muted_until = updates.mutedUntil;
      if (updates.role !== undefined) dbUpdates.role = updates.role;

      const { error } = await supabaseClient
        .from('profiles')
        .update(dbUpdates)
        .eq('email', email);
      return !error;
    } catch (e) {
      console.error('Error updating user status:', e);
      return false;
    }
  }

  // Clubs
  async getClubs(limit: number = 50, offset: number = 0): Promise<Club[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('clubs')
        .select('*, club_members(count)')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      
      return data?.map((d: any) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        avatarUrl: d.avatar_url,
        creatorId: d.creator_id,
        createdAt: d.created_at,
        membersCount: d.club_members?.[0]?.count || 0
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async getClub(id: string): Promise<Club | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const { data } = await supabaseClient
        .from('clubs')
        .select('*')
        .eq('id', id)
        .single();
      
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        avatarUrl: data.avatar_url,
        creatorId: data.creator_id,
        createdAt: data.created_at,
        isPrivate: data.is_private
      };
    } catch (e) {
      return null;
    }
  }

  async createClub(club: { name: string; description: string; avatarUrl: string; creatorId: string; isPrivate?: boolean }): Promise<Club | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const { data, error } = await supabaseClient
        .from('clubs')
        .insert([{
          name: club.name,
          description: club.description,
          avatar_url: club.avatarUrl,
          creator_id: club.creatorId,
          is_private: club.isPrivate || false
        }])
        .select()
        .single();
      
      if (error || !data) return null;

      // Add creator as admin member
      await supabaseClient.from('club_members').insert([{
        club_id: data.id,
        user_id: club.creatorId,
        role: 'admin',
        status: 'active'
      }]);

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        avatarUrl: data.avatar_url,
        creatorId: data.creator_id,
        createdAt: data.created_at,
        isPrivate: data.is_private
      };
    } catch (e) {
      return null;
    }
  }

  async joinClub(clubId: string, userId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      // Check if club is private
      const club = await this.getClub(clubId);
      const status = club?.isPrivate ? 'pending' : 'active';

      const { error } = await supabaseClient
        .from('club_members')
        .insert([{ club_id: clubId, user_id: userId, role: 'member', status }]);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async leaveClub(clubId: string, userId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      // Check if this is the last member
      const { data: members } = await supabaseClient
        .from('club_members')
        .select('user_id')
        .eq('club_id', clubId);
      
      const isLastMember = members && members.length === 1 && members[0].user_id === userId;

      const { error } = await supabaseClient
        .from('club_members')
        .delete()
        .eq('club_id', clubId)
        .eq('user_id', userId);
      
      if (error) return false;

      if (isLastMember) {
        await this.deleteClub(clubId);
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  async updateClub(clubId: string, updates: { name?: string; description?: string; avatarUrl?: string; isPrivate?: boolean }): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const dbUpdates: any = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.avatarUrl) dbUpdates.avatar_url = updates.avatarUrl;
      if (updates.isPrivate !== undefined) dbUpdates.is_private = updates.isPrivate;

      const { error } = await supabaseClient
        .from('clubs')
        .update(dbUpdates)
        .eq('id', clubId);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async kickMember(clubId: string, userId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      // Delete messages first
      await supabaseClient.from('club_messages').delete().eq('club_id', clubId).eq('user_id', userId);
      // Delete member
      const { error } = await supabaseClient
        .from('club_members')
        .delete()
        .eq('club_id', clubId)
        .eq('user_id', userId);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async approveJoinRequest(clubId: string, userId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient
        .from('club_members')
        .update({ status: 'active' })
        .eq('club_id', clubId)
        .eq('user_id', userId);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async rejectJoinRequest(clubId: string, userId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient
        .from('club_members')
        .delete()
        .eq('club_id', clubId)
        .eq('user_id', userId);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async uploadClubAvatar(file: File): Promise<string | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('club-avatars')
        .upload(filePath, file);

      if (uploadError) {
          console.error('Upload error:', uploadError);
          return null;
      }

      const { data } = supabaseClient.storage.from('club-avatars').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('Upload exception:', e);
      return null;
    }
  }

  async uploadCollectionCover(file: File): Promise<string | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `covers/${fileName}`;

      const { error: uploadError } = await supabaseClient.storage
        .from('collection-covers')
        .upload(filePath, file);

      if (uploadError) {
          console.error('Upload error:', uploadError);
          return null;
      }

      const { data } = supabaseClient.storage.from('collection-covers').getPublicUrl(filePath);
      return data.publicUrl;
    } catch (e) {
      console.error('Upload exception:', e);
      return null;
    }
  }

  async deleteClub(clubId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      // Delete messages first (though foreign keys should handle it if set to cascade)
      await supabaseClient.from('club_messages').delete().eq('club_id', clubId);
      await supabaseClient.from('club_members').delete().eq('club_id', clubId);
      const { error } = await supabaseClient.from('clubs').delete().eq('id', clubId);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async getClubMembers(clubId: string): Promise<ClubMember[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('club_members')
        .select('*, profiles(*)')
        .eq('club_id', clubId);
      
      return data?.map((d: any) => ({
        clubId: d.club_id,
        userId: d.user_id,
        role: d.role,
        status: d.status || 'active',
        joinedAt: d.joined_at,
        user: this.mapProfileToUser(d.profiles)
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async getClubMessages(clubId: string): Promise<ClubMessage[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('club_messages')
        .select('*, profiles(name, avatar, email)')
        .eq('club_id', clubId)
        .order('created_at', { ascending: true })
        .limit(100);
      
      return data?.map((d: any) => ({
        id: d.id,
        clubId: d.club_id,
        userId: d.user_id,
        content: d.content,
        createdAt: d.created_at,
        user: {
          name: d.profiles?.name || 'Unknown',
          avatar: d.profiles?.avatar || '',
          email: d.profiles?.email || ''
        }
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async sendClubMessage(clubId: string, userId: string, content: string): Promise<ClubMessage | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const { data, error } = await supabaseClient
        .from('club_messages')
        .insert([{ club_id: clubId, user_id: userId, content }])
        .select('*, profiles(name, avatar, email)')
        .single();
      
      if (error || !data) return null;
      return {
        id: data.id,
        clubId: data.club_id,
        userId: data.user_id,
        content: data.content,
        createdAt: data.created_at,
        user: {
          name: data.profiles?.name || 'Unknown',
          avatar: data.profiles?.avatar || '',
          email: data.profiles?.email || ''
        }
      };
    } catch (e) {
      return null;
    }
  }

  async updateClubMessage(messageId: string, content: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient
        .from('club_messages')
        .update({ content })
        .eq('id', messageId);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async deleteClubMessage(messageId: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      const { error } = await supabaseClient
        .from('club_messages')
        .delete()
        .eq('id', messageId);
      return !error;
    } catch (e) {
      return false;
    }
  }

  // Community Collections
  async getCommunityCollections(): Promise<CommunityCollection[]> {
    if (!this.isSupabaseAvailable()) return [];
    try {
      const { data } = await supabaseClient
        .from('community_collections')
        .select('*, profiles(name, avatar, email), community_collection_items(*)')
        .eq('is_public', true)
        .order('created_at', { ascending: false });
      
      return data?.map((d: any) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        creatorId: d.creator_id,
        isPublic: d.is_public,
        createdAt: d.created_at,
        coverImage: d.cover_image,
        creator: {
          name: d.profiles?.name || 'Unknown',
          avatar: d.profiles?.avatar || '',
          email: d.profiles?.email || ''
        },
        items: d.community_collection_items?.map((i: any) => ({
          collectionId: i.collection_id,
          animeId: i.anime_id,
          animeTitle: i.anime_title,
          animeImage: i.anime_image,
          addedAt: i.added_at
        }))
      })) || [];
    } catch (e) {
      return [];
    }
  }

  async getCommunityCollection(id: string): Promise<CommunityCollection | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const { data } = await supabaseClient
        .from('community_collections')
        .select('*, profiles(name, avatar, email), community_collection_items(*)')
        .eq('id', id)
        .single();
      
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        description: data.description,
        creatorId: data.creator_id,
        isPublic: data.is_public,
        createdAt: data.created_at,
        coverImage: data.cover_image,
        creator: {
          name: data.profiles?.name || 'Unknown',
          avatar: data.profiles?.avatar || '',
          email: data.profiles?.email || ''
        },
        items: data.community_collection_items?.map((i: any) => ({
          collectionId: i.collection_id,
          animeId: i.anime_id,
          animeTitle: i.anime_title,
          animeImage: i.anime_image,
          addedAt: i.added_at
        }))
      };
    } catch (e) {
      return null;
    }
  }

  async createCommunityCollection(collection: { name: string; description: string; creatorId: string; isPublic: boolean; coverImage?: string }, items: { animeId: string; animeTitle: string; animeImage: string }[]): Promise<CommunityCollection | null> {
    if (!this.isSupabaseAvailable()) return null;
    try {
      const collectionId = crypto.randomUUID();
      const { data, error } = await supabaseClient
        .from('community_collections')
        .insert([{
          id: collectionId,
          name: collection.name,
          description: collection.description,
          creator_id: collection.creatorId,
          is_public: collection.isPublic,
          cover_image: collection.coverImage
        }])
        .select()
        .single();
      
      if (error) {
        console.error("Error inserting collection:", error);
        throw error;
      }
      if (!data) return null;

      if (items.length > 0) {
        const itemPayloads = items.map(item => ({
          collection_id: data.id,
          anime_id: item.animeId,
          anime_title: item.animeTitle,
          anime_image: item.animeImage
        }));
        const { error: itemsError } = await supabaseClient.from('community_collection_items').insert(itemPayloads);
        if (itemsError) {
           console.error("Error inserting collection items:", itemsError);
           throw itemsError;
        }
      }

      return this.getCommunityCollection(data.id);
    } catch (e) {
      console.error("createCommunityCollection exception:", e);
      throw e;
    }
  }
  async deleteCommunityCollection(id: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) return false;
    try {
      await supabaseClient.from('community_collection_items').delete().eq('collection_id', id);
      const { error } = await supabaseClient.from('community_collections').delete().eq('id', id);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async getDmcaBlocks(): Promise<string[]> {
    try {
      const { data, error } = await supabaseClient.from('dmca_blocks').select('anime_id');
      if (error) return [];
      return data.map((d: any) => d.anime_id);
    } catch (e) {
      return [];
    }
  }

  async addDmcaBlock(animeId: string): Promise<boolean> {
    try {
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      const { error } = await supabaseClient.from('dmca_blocks').insert([{ id, anime_id: animeId }]);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async removeDmcaBlock(animeId: string): Promise<boolean> {
    try {
      const { error } = await supabaseClient.from('dmca_blocks').delete().eq('anime_id', animeId);
      return !error;
    } catch (e) {
      return false;
    }
  }
  async getSlugBlocks(): Promise<string[]> {
    try {
      const { data, error } = await supabaseClient.from('slug_blocks').select('anime_id');
      if (error) return [];
      return data.map((d: any) => d.anime_id);
    } catch (e) {
      return [];
    }
  }

  async addSlugBlock(animeId: string): Promise<boolean> {
    try {
      const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
      const { error } = await supabaseClient.from('slug_blocks').insert([{ id, anime_id: animeId }]);
      return !error;
    } catch (e) {
      return false;
    }
  }

  async removeSlugBlock(animeId: string): Promise<boolean> {
    try {
      const { error } = await supabaseClient.from('slug_blocks').delete().eq('anime_id', animeId);
      return !error;
    } catch (e) {
      return false;
    }
  }
}

export const db = new DatabaseService();
export const supabase = supabaseClient;
