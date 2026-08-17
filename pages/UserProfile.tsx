
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { User, Anime } from '../types';
import { fetchAnimes } from '../services/shikimori';
import { Loader2, Heart, History, ArrowLeft, UserPlus, MessageSquare, Check, Film, X, Clock, Tv } from 'lucide-react';
import SEO from '../components/SEO';
import { Image } from '../components/Image';
import { useSlugBlocks } from '../store/slugBlocks';
import { useDmcaBlocks } from '../store/dmcaBlocks';
import { AnimeListRow } from '../components/AnimeListRow';

const UserProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const { slugBlocks } = useSlugBlocks();
  const { dmcaBlocks } = useDmcaBlocks();
  const [profile, setProfile] = useState<User | null>(null);
  const [allFavIds, setAllFavIds] = useState<string[]>([]);
  const [allWatchedIds, setAllWatchedIds] = useState<string[]>([]);
  const [allWatchingIds, setAllWatchingIds] = useState<string[]>([]);
  const [allDroppedIds, setAllDroppedIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Anime[]>([]);
  const [watched, setWatched] = useState<Anime[]>([]);
  const [watching, setWatching] = useState<Anime[]>([]);
  const [dropped, setDropped] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'favs' | 'watched' | 'watching' | 'dropped'>('favs');
  const [isFriend, setIsFriend] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        let user: User | null = null;
        
        // Check if ID is UUID or email (simple check)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        
        if (isUuid) {
            user = await db.getProfileById(id);
        } else if (id.includes('@')) {
            user = await db.getProfile(id);
        } else {
            // Try fetching by name first, then fallback to ID
            user = await db.getProfileByName(id);
            if (!user) {
                user = await db.getProfileById(id);
            }
        }

        if (user) {
          setProfile(user);
          setIsLoading(false); // Stop loading immediately after profile is found
          
          // Check friendship status
          if (currentUser && currentUser.friends && (currentUser.friends.includes(user.email) || currentUser.friends.includes(user.id || ''))) {
              setIsFriend(true);
          }
          
          // Load lists asynchronously
          const [favIds, watchedIds] = await Promise.all([
            db.getFavorites(user.email),
            db.getWatched(user.email)
          ]);

          setAllFavIds(Array.isArray(favIds) ? favIds : []);
          setAllWatchedIds(Array.isArray(watchedIds) ? watchedIds : []);
          setAllWatchingIds(Array.isArray(user.watchingAnimeIds) ? user.watchingAnimeIds : []);
          setAllDroppedIds(Array.isArray(user.droppedAnimeIds) ? user.droppedAnimeIds : []);

        } else {
            setIsLoading(false);
        }
      } catch (e) {
        console.error('Failed to load user profile', e);
        setIsLoading(false);
      }
    };
    loadProfile();
  }, [id, currentUser]);

  // Progressive load tab content
  useEffect(() => {
    let isCancelled = false;

    const loadAllAnimes = async (ids: string[] | null | undefined, setter: React.Dispatch<React.SetStateAction<Anime[]>>) => {
      if (!Array.isArray(ids)) return;
      const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
      if (uniqueIds.length === 0) return;
      
      const chunkSize = 50;
      let allLoaded: Anime[] = [];
      setter([]); // reset first
      
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        if (isCancelled) break;
        const chunk = uniqueIds.slice(i, i + chunkSize);
        try {
          const data = await fetchAnimes({ ids: chunk.join(','), limit: chunk.length }, true);
          if (Array.isArray(data)) {
            allLoaded = [...allLoaded, ...data];
            if (!isCancelled) {
              setter(allLoaded);
            }
          }
        } catch (e) {
          console.error("Error loading chunk", e);
        }
      }
    };

    if (activeTab === 'favs' && favorites.length === 0 && allFavIds.length > 0) {
      loadAllAnimes(allFavIds, setFavorites);
    } else if (activeTab === 'watched' && watched.length === 0 && allWatchedIds.length > 0) {
      loadAllAnimes(allWatchedIds, setWatched);
    } else if (activeTab === 'watching' && watching.length === 0 && allWatchingIds.length > 0) {
      loadAllAnimes(allWatchingIds, setWatching);
    } else if (activeTab === 'dropped' && dropped.length === 0 && allDroppedIds.length > 0) {
      loadAllAnimes(allDroppedIds, setDropped);
    }

    return () => {
      isCancelled = true;
    };
  }, [activeTab, allFavIds, allWatchedIds, allWatchingIds, allDroppedIds]);

  // Always progressive load watched in background if not already loading, to get total stats
  // We can just rely on the active tab, but to get total stats for watched, we might need it implicitly.
  // Actually, wait, lets just load watched in the background regardless of active tab for stats
  useEffect(() => {
    let isCancelled = false;
    
    const prefetchWatchedForStats = async () => {
       if (!Array.isArray(allWatchedIds) || allWatchedIds.length === 0 || watched.length > 0) return;
       const uniqueIds = Array.from(new Set(allWatchedIds.filter(Boolean)));
       const chunkSize = 50;
       let allLoaded: Anime[] = [];
       for (let i = 0; i < uniqueIds.length; i += chunkSize) {
          if (isCancelled) break;
          const chunk = uniqueIds.slice(i, i + chunkSize);
          try {
             // Lower priority for background prefetch
             const data = await fetchAnimes({ ids: chunk.join(','), limit: chunk.length }, false, 2);
             if (Array.isArray(data)) {
                allLoaded = [...allLoaded, ...data];
             }
          } catch (e) {}
       }
       if (!isCancelled && allLoaded.length > 0) {
          setWatched(allLoaded);
       }
    };
    
    if (activeTab !== 'watched' && allWatchedIds.length > 0 && watched.length === 0) {
       prefetchWatchedForStats();
    }
    
    return () => { isCancelled = true; };
  }, [allWatchedIds, activeTab]);

  const handleAddFriend = async () => {
      if (!currentUser || !profile) return;
      setIsAddingFriend(true);
      try {
          const success = await db.addFriend(currentUser.email, profile.email);
          if (success) {
             setIsFriend(true);
             window.dispatchEvent(new Event('profileUpdated'));
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsAddingFriend(false);
      }
  };

  const handleRemoveFriend = async () => {
      if (!currentUser || !profile) return;
      setIsAddingFriend(true);
      try {
          const success = await db.removeFriend(currentUser.email, profile.email);
          if (success) {
             setIsFriend(false);
             // Dispatch a custom event to tell AuthContext to refresh session
             window.dispatchEvent(new Event('profileUpdated'));
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsAddingFriend(false);
      }
  };

  const isOwnProfile = currentUser?.email === profile?.email;

  const watchStats = {
     totalEpisodes: 0,
     totalHours: 0
  };
  watched.forEach(anime => {
     watchStats.totalEpisodes += anime.episodesAired || anime.episodes || 0;
     watchStats.totalHours += Math.round(((anime.episodesAired || anime.episodes || 0) * 24) / 60);
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold text-white">Пользователь не найден</h1>
        <Link to="/" className="text-primary hover:underline">На главную</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <SEO title={`${profile.name} - Профиль`} description={`Профиль пользователя ${profile.name} на KamiAnime`} />
      
      {/* Banner */}
      <div className="h-64 md:h-80 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface/90 z-10"></div>
        {profile.profileBanner ? (
          <img src={profile.profileBanner} alt="Banner" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-surface-light/10"></div>
        )}
        <Link to="/" className="absolute top-8 left-8 z-20 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors">
            <ArrowLeft className="w-6 h-6" />
        </Link>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-20">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Avatar & Info */}
          <div className="w-full md:w-80 flex flex-col gap-6">
             <div className="relative group mx-auto md:mx-0">
                <div className={`w-40 h-40 md:w-48 md:h-48 ${profile.avatarShape === 'round' ? 'rounded-full' : profile.avatarShape === 'square' ? 'rounded-none' : 'rounded-3xl'} overflow-hidden border-4 border-surface shadow-2xl bg-surface`}>
                  <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
                </div>
             </div>

             <div className="bg-surface/50 backdrop-blur-md border border-white/5 rounded-3xl p-6 space-y-4">
                <h1 className="text-2xl font-black text-white uppercase tracking-tight text-center md:text-left">{profile.name}</h1>
                {profile.bio && (
                    <p className="text-slate-400 text-sm leading-relaxed text-center md:text-left">{profile.bio}</p>
                )}

                {/* --- STATS BLOCK --- */}
                <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
                   <div className="flex items-center gap-3 text-slate-300">
                       <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <Tv className="w-4 h-4 text-primary" />
                       </div>
                       <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Просмотрено</span>
                          <span className="font-black text-sm">{watchStats.totalEpisodes} серий</span>
                       </div>
                   </div>
                   <div className="flex items-center gap-3 text-slate-300">
                       <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                          <Clock className="w-4 h-4 text-green-500" />
                       </div>
                       <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Потрачено</span>
                          <span className="font-black text-sm">{watchStats.totalHours} часов</span>
                       </div>
                   </div>
                </div>
                {/* --- END STATS BLOCK --- */}
                
                {!isOwnProfile && (
                    <div className="flex flex-col gap-3 pt-4 border-t border-white/5">
                        {isFriend ? (
                            <button 
                                onClick={handleRemoveFriend}
                                disabled={isAddingFriend || !currentUser}
                                className="w-full py-3 bg-red-500/20 text-red-500 rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 cursor-pointer hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                                {isAddingFriend ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Удалить из друзей
                            </button>
                        ) : (
                            <button 
                                onClick={handleAddFriend}
                                disabled={isAddingFriend || !currentUser}
                                className="w-full py-3 bg-primary text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-violet-600 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50"
                            >
                                {isAddingFriend ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Добавить в друзья
                            </button>
                        )}
                        
                        <Link 
                            to={`/messages?user=${profile.email}`}
                            className="w-full py-3 bg-white/5 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                        >
                            <MessageSquare className="w-4 h-4" />
                            Написать сообщение
                        </Link>
                    </div>
                )}
             </div>
          </div>

          {/* Content */}
          <div className="flex-1 w-full md:pt-[216px]">
             {/* Tabs */}
             <div className="flex gap-4 border-b border-white/5 mb-8 overflow-x-auto pb-2">
                <button 
                  onClick={() => setActiveTab('favs')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'favs' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                >
                    <Heart className="w-4 h-4" /> Избранное <span className="opacity-50 ml-1">{favorites.length > 0 ? favorites.length : allFavIds.length}</span>
                </button>
                <button 
                  onClick={() => setActiveTab('watched')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'watched' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                >
                    <History className="w-4 h-4" /> Просмотрено <span className="opacity-50 ml-1">{watched.length > 0 ? watched.length : allWatchedIds.length}</span>
                </button>
                <button 
                  onClick={() => setActiveTab('watching')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'watching' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                >
                    <Film className="w-4 h-4" /> Смотрю <span className="opacity-50 ml-1">{watching.length > 0 ? watching.length : allWatchingIds.length}</span>
                </button>
                <button 
                  onClick={() => setActiveTab('dropped')}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'dropped' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                >
                    <X className="w-4 h-4" /> Брошено <span className="opacity-50 ml-1">{dropped.length > 0 ? dropped.length : allDroppedIds.length}</span>
                </button>
             </div>

             {/* List View */}
             <div className="flex flex-col gap-3">
                {activeTab === 'favs' && Array.isArray(favorites) && favorites.map(anime => (
                    <AnimeListRow key={anime.id} anime={anime} />
                ))}
                {activeTab === 'watched' && Array.isArray(watched) && watched.map(anime => (
                    <AnimeListRow key={anime.id} anime={anime} />
                ))}
                {activeTab === 'watching' && Array.isArray(watching) && watching.map(anime => (
                    <AnimeListRow key={anime.id} anime={anime} />
                ))}
                {activeTab === 'dropped' && Array.isArray(dropped) && dropped.map(anime => (
                    <AnimeListRow key={anime.id} anime={anime} />
                ))}
             </div>
             
             {((activeTab === 'favs' && favorites.length === 0 && allFavIds.length === 0) || 
               (activeTab === 'watched' && watched.length === 0 && allWatchedIds.length === 0) ||
               (activeTab === 'watching' && watching.length === 0 && allWatchingIds.length === 0) ||
               (activeTab === 'dropped' && dropped.length === 0 && allDroppedIds.length === 0)) && (
                 <div className="text-center py-20 text-slate-500 text-sm uppercase tracking-widest font-bold">
                     Список пуст
                 </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
