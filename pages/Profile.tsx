
import React, { useEffect, useState, useRef } from 'react';
import { History, Heart, Settings, Clock, PlayCircle, LogIn, Loader2, Mail, CheckCircle, User as UserIcon, Crown, Users, Save, Edit2, Camera, Upload, Palette, Layout, Search, Filter, Image as ImageIcon, LayoutTemplate, X, ChevronRight, ChevronUp, ChevronDown, Grid } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import { fetchAnimes } from '../services/shikimori';
import { Anime, User } from '../types';
import { FALLBACK_IMAGE } from '../constants';
import { Link } from 'react-router-dom';
import imageCompression from 'browser-image-compression';
import SEO from '../components/SEO';
import { useSlugBlocks } from '../store/slugBlocks';
import { useDmcaBlocks } from '../store/dmcaBlocks';
import { motion, PanInfo } from 'motion/react';

const Profile: React.FC = () => {
  const { user, openAuthModal, updateProfile } = useAuth();
  const { slugBlocks } = useSlugBlocks();
  const { dmcaBlocks } = useDmcaBlocks();
  const [allFavIds, setAllFavIds] = useState<string[]>([]);
  const [allWatchedIds, setAllWatchedIds] = useState<string[]>([]);
  const [allWatchingIds, setAllWatchingIds] = useState<string[]>([]);
  const [allDroppedIds, setAllDroppedIds] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<Anime[]>([]);
  const [watched, setWatched] = useState<Anime[]>([]);
  const [watching, setWatching] = useState<Anime[]>([]);
  const [dropped, setDropped] = useState<Anime[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'favs' | 'watched' | 'watching' | 'dropped' | 'history' | 'friends' | 'settings' | 'design' | 'integrations'>('favs');
  const [limits, setLimits] = useState({ favs: 20, watched: 20, watching: 20, dropped: 20, history: 20 });
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('popularity');
  const [searchResults, setSearchResults] = useState<Anime[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<any>(null);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.name || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [editAvatar, setEditAvatar] = useState(user?.avatar || '');
  
  // Design State
  const [editBg, setEditBg] = useState(user?.profileBg || '');
  const [editBanner, setEditBanner] = useState(user?.profileBanner || '');
  const [editLayout, setEditLayout] = useState<'standard' | 'reversed' | 'centered'>(user?.profileLayout || 'standard');
  const [editTheme, setEditTheme] = useState(user?.themeColor || '#8b5cf6'); // Default primary
  const [editAvatarShape, setEditAvatarShape] = useState<'round' | 'rounded' | 'square'>(user?.avatarShape || 'round');
  const [editCardOpacity, setEditCardOpacity] = useState(user?.cardOpacity ?? 80);
  const [editCardBlur, setEditCardBlur] = useState(user?.cardBlur ?? 10);
  const [editCardBg, setEditCardBg] = useState(user?.cardBg || '');
  const [editTextColor, setEditTextColor] = useState(user?.textColor || '#ffffff');
  const [editBlocks, setEditBlocks] = useState<string[]>(user?.profileBlocks?.length ? user.profileBlocks : ['info', 'stats', 'nav']);
  const [blockPositions, setBlockPositions] = useState<Record<string, {x: number, y: number, scale?: number}>>(user?.profilePositions && Object.keys(user.profilePositions).length ? user.profilePositions : {});
  const [isVisualEditMode, setIsVisualEditMode] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingBg, setIsUploadingBg] = useState(false);
  const [isUploadingCardBg, setIsUploadingCardBg] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Cache management state
  const [cacheSizeKB, setCacheSizeKB] = useState<number>(0);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheSuccessMsg, setCacheSuccessMsg] = useState('');
  const [isClearingServerCache, setIsClearingServerCache] = useState(false);
  const [serverCacheSuccessMsg, setServerCacheSuccessMsg] = useState('');

  const updateCacheSize = () => {
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('as_cache_') || key.startsWith('as_manga_') || key.includes('cache'))) {
          const val = localStorage.getItem(key);
          if (val) {
            totalBytes += (key.length + val.length) * 2;
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    setCacheSizeKB(Math.round(totalBytes / 102.4) / 10);
  };

  useEffect(() => {
    updateCacheSize();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const cardBgInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Неподдерживаемый формат файла. Разрешены: JPG, PNG, WEBP, GIF');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit before compression
      setUploadError('Файл слишком большой. Максимум 10МБ');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Compression options
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);
      
      const publicUrl = await db.uploadAvatar(compressedFile, user.id || user.email);
      if (publicUrl) {
        setEditAvatar(publicUrl);
        // If not in editing mode (e.g. clicking camera icon), save immediately
        if (!isEditing && activeTab !== 'settings') {
          await updateProfile({ avatar: publicUrl });
        }
      } else {
        setUploadError('Ошибка при загрузке файла в хранилище');
      }
    } catch (err) {
      console.error('Compression/Upload error:', err);
      setUploadError('Произошла ошибка при обработке изображения');
    } finally {
      setIsUploading(false);
    }
  };

  const createUploadHandler = (setState: any, setUploading: any, suffix: string) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Неподдерживаемый формат файла.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) { 
      setUploadError('Файл слишком большой. Максимум 10МБ');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const img = new window.Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const reader = new FileReader();

      await new Promise((resolve, reject) => {
        reader.onload = e => { img.src = e.target?.result as string; };
        reader.onerror = reject;
        reader.readAsDataURL(file);
        img.onload = () => {
          let { width, height } = img;
          const MAX_SIZE = 1920; 
          if (width > MAX_SIZE || height > MAX_SIZE) {
            if (width > height) {
              height = Math.round((height * MAX_SIZE) / width);
              width = MAX_SIZE;
            } else {
              width = Math.round((width * MAX_SIZE) / height);
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(null);
        };
      });

      const compressedBase64 = canvas.toDataURL('image/webp', 0.85);
      const res = await fetch(compressedBase64);
      const blob = await res.blob();
      const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' });

      const url = await db.uploadAvatar(compressedFile, (user.id || user.email) + '_' + suffix);
      
      if (url) {
        setState(url);
      } else {
        setUploadError('Не удалось загрузить картинку');
      }
    } catch (e) {
      console.error(e);
      setUploadError('Ошибка при загрузке');
    } finally {
      setUploading(false);
    }
  };

  const handleBannerUpload = createUploadHandler(setEditBanner, setIsUploadingBanner, 'banner');
  const handleBgUpload = createUploadHandler(setEditBg, setIsUploadingBg, 'bg');
  const handleCardBgUpload = createUploadHandler(setEditCardBg, setIsUploadingCardBg, 'card_bg');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const manual = urlParams.get('manual');
    if (code && user?.email) {
      const linkShikimori = async () => {
         setIsActionLoading(true);
         try {
           const res = await fetch('/api/shikimori/oauth', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ 
                code, 
                email: user.email, 
                redirectUri: manual ? "urn:ietf:wg:oauth:2.0:oob" : window.location.origin + '/profile' 
             })
           });
           const data = await res.json();
           if (data.success) {
               alert(`Успешно привязан аккаунт Shikimori: ${data.username}`);
               window.history.replaceState({}, document.title, window.location.pathname);
               window.location.reload();
           } else {
               alert(`Ошибка привязки Shikimori: ${data.error}`);
               window.history.replaceState({}, document.title, window.location.pathname);
           }
         } catch(e) {
           console.error(e);
           alert('Сетевая ошибка при привязке Shikimori');
         } finally {
           setIsActionLoading(false);
         }
      };
      linkShikimori();
    }
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;

    const loadUserData = async () => {
      if (isLoading) return; // Prevent double loading
      setIsLoading(true);
      try {
        const [favIds, watchedIds, historyData] = await Promise.all([
          db.getFavorites(user.email),
          db.getWatched(user.email),
          db.getHistory(user.email)
        ]);

        setAllFavIds(favIds);
        setAllWatchedIds(watchedIds);
        setAllWatchingIds(user.watchingAnimeIds || []);
        setAllDroppedIds(user.droppedAnimeIds || []);
        setHistory(historyData);
        
        // Load friends immediately
        if (user.friends && user.friends.length > 0) {
          db.getFriendsList(user.friends.slice(0, 20)).then(setFriends).catch(console.error);
        }
        
        // Sync state with user
        setEditName(user.name);
        setEditBio(user.bio || '');
        setEditAvatar(user.avatar);
        setEditBg(user.profileBg || '');
        setEditBanner(user.profileBanner || '');
        setEditLayout(user.profileLayout || 'standard');
        setEditTheme(user.themeColor || '#8b5cf6');
        setEditAvatarShape(user.avatarShape || 'round');
        setEditCardOpacity(user.cardOpacity ?? 80);
        setEditCardBlur(user.cardBlur ?? 10);
        setEditCardBg(user.cardBg || '');
        setEditTextColor(user.textColor || '#ffffff');
        setEditBlocks(user.profileBlocks?.length ? user.profileBlocks : ['info', 'stats', 'nav']);

      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [user?.email]);

  // Search and Sort Effect
  useEffect(() => {
    if (['history', 'friends', 'settings', 'design', 'integrations'].includes(activeTab)) {
       setSearchResults(null);
       setSearchQuery('');
       return;
    }

    if (!searchQuery && sortOrder === 'popularity') {
       setSearchResults(null);
       return;
    }

    const allIdsForTab = activeTab === 'favs' ? allFavIds : activeTab === 'watched' ? allWatchedIds : activeTab === 'watching' ? allWatchingIds : allDroppedIds;
    
    if (!allIdsForTab || allIdsForTab.length === 0) {
        setSearchResults([]);
        return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    
    searchTimeoutRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
            const idsToSearch = allIdsForTab.filter(Boolean).slice(0, 500);
            if (idsToSearch.length === 0) {
               setSearchResults([]);
               return;
            }
            const params: any = { ids: idsToSearch.join(','), limit: 50, order: sortOrder };
            if (searchQuery) params.search = searchQuery;
            
            const data = await fetchAnimes(params, true);
            setSearchResults(data || []);
        } catch (e) {
            console.error("Search error", e);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, 500);

    return () => {
       if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    }
  }, [searchQuery, sortOrder, activeTab, allFavIds, allWatchedIds, allWatchingIds, allDroppedIds]);

  // Lazy load tab content
  useEffect(() => {
    const loadTabContent = async () => {
      if (activeTab === 'favs' && favorites.length < limits.favs && Array.isArray(allFavIds) && allFavIds.length > 0) {
         const idsToLoad = allFavIds.filter(Boolean).slice(0, limits.favs);
         if (idsToLoad.length === 0) return;
         try {
            const data = await fetchAnimes({ ids: idsToLoad.join(','), limit: idsToLoad.length }, true);
            setFavorites(data);
         } catch (e) {
            console.error("Error loading favorites", e);
         }
      } else if (activeTab === 'watched' && watched.length < limits.watched && Array.isArray(allWatchedIds) && allWatchedIds.length > 0) {
         const idsToLoad = allWatchedIds.filter(Boolean).slice(0, limits.watched);
         if (idsToLoad.length === 0) return;
         try {
            const data = await fetchAnimes({ ids: idsToLoad.join(','), limit: idsToLoad.length }, true);
            setWatched(data);
         } catch (e) {
            console.error("Error loading watched", e);
         }
      } else if (activeTab === 'watching' && watching.length < limits.watching && Array.isArray(allWatchingIds) && allWatchingIds.length > 0) {
         const idsToLoad = allWatchingIds.filter(Boolean).slice(0, limits.watching);
         if (idsToLoad.length === 0) return;
         try {
            const data = await fetchAnimes({ ids: idsToLoad.join(','), limit: idsToLoad.length }, true);
            setWatching(data);
         } catch (e) {
            console.error("Error loading watching", e);
         }
      } else if (activeTab === 'dropped' && dropped.length < limits.dropped && Array.isArray(allDroppedIds) && allDroppedIds.length > 0) {
         const idsToLoad = allDroppedIds.filter(Boolean).slice(0, limits.dropped);
         if (idsToLoad.length === 0) return;
         try {
            const data = await fetchAnimes({ ids: idsToLoad.join(','), limit: idsToLoad.length }, true);
            setDropped(data);
         } catch (e) {
            console.error("Error loading dropped", e);
         }
      }
    };
    loadTabContent();
  }, [activeTab, allFavIds, allWatchedIds, allWatchingIds, allDroppedIds, limits]);

  const [watchStats, setWatchStats] = useState({ episodes: user?.episodesWatched || 0, hours: user?.watchedTime || 0 });

  // Calculate real stats in background
  useEffect(() => {
      let isCancelled = false;
      const calculateStats = async () => {
         if (!Array.isArray(allWatchedIds) || allWatchedIds.length === 0) return;
         
         const uniqueIds = Array.from(new Set(allWatchedIds.filter(Boolean)));
         const chunkSize = 50;
         let totalEps = 0;
         
         // Prioritize fast calculation
         for (let i = 0; i < uniqueIds.length; i += chunkSize) {
            if (isCancelled) break;
            const chunk = uniqueIds.slice(i, i + chunkSize);
            try {
               const data = await fetchAnimes({ ids: chunk.join(','), limit: chunk.length }, false, 2);
               if (Array.isArray(data)) {
                   data.forEach(anime => {
                       totalEps += (anime.episodesAired || anime.episodes || 0);
                   });
               }
            } catch (e) {}
         }
         
         if (!isCancelled) {
             const hours = Math.round((totalEps * 24) / 60);
             setWatchStats({ episodes: totalEps, hours });
             
             // Opportunistically update DB if stats changed
             if (user && (user.episodesWatched !== totalEps || user.watchedTime !== String(hours))) {
                 db.updateProfile(user.email, { episodesWatched: totalEps, watchedTime: String(hours) });
             }
         }
      };
      
      calculateStats();
      return () => { isCancelled = true; };
  }, [allWatchedIds, user?.email]);

  // We need to fetch 'watched' anime details to compute watch stats correctly even if we aren't on the watched tab
  useEffect(() => {
    let isCancelled = false;
    const prefetchWatchedForStats = async () => {
        if (!allWatchedIds || allWatchedIds.length === 0) return;
        
        let allLoaded: any[] = [];
        const chunkSize = 50; 
        for (let i = 0; i < allWatchedIds.length; i += chunkSize) {
           if (isCancelled) break;
           const chunk = allWatchedIds.filter(Boolean).slice(i, i + chunkSize);
           if (chunk.length === 0) continue;
           try {
              const data = await fetchAnimes({ ids: chunk.join(','), limit: chunk.length }, true);
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

  const handleSaveProfile = async () => {
    setIsActionLoading(true);
    try {
      const success = await updateProfile({
        name: editName,
        bio: editBio,
        avatar: editAvatar,
        profileBg: editBg,
        profileBanner: editBanner,
        profileLayout: editLayout,
        themeColor: editTheme,
        avatarShape: editAvatarShape,
        cardOpacity: typeof editCardOpacity === 'number' ? editCardOpacity : 80,
        cardBlur: typeof editCardBlur === 'number' ? editCardBlur : 10,
        cardBg: editCardBg,
        textColor: editTextColor,
        profileBlocks: editBlocks,
        profilePositions: blockPositions
      });
      if (success) {
        setIsEditing(false);
      } else {
        alert('Не удалось сохранить изменения. Попробуйте позже.');
      }
    } catch (e: any) {
      console.error(e);
      if (e.message === 'Username already taken') {
          alert('Это имя пользователя уже занято. Пожалуйста, выберите другое.');
      } else {
          alert('Произошла ошибка при сохранении.');
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <LogIn className="w-20 h-20 text-slate-600 mx-auto mb-8" />
        <h2 className="text-3xl font-black text-white mb-4 uppercase">Личный кабинет</h2>
        <p className="text-slate-500 mb-10 font-medium">Авторизуйтесь, чтобы синхронизировать ваши данные.</p>
        <button onClick={openAuthModal} className="px-10 py-4 bg-primary rounded-2xl font-black text-white uppercase tracking-widest text-xs">Войти в аккаунт</button>
      </div>
    );
  }

  // Styles based on customization
  const currentBg = editBg;
  const currentTheme = editTheme;
  const containerStyle = currentBg ? {
      backgroundImage: `url(${currentBg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed'
  } : {};

  const currentCardOpacity = typeof editCardOpacity === 'number' ? editCardOpacity : 80;
  const currentCardBlur = typeof editCardBlur === 'number' ? editCardBlur : 10;
  
  const currentCardBg = editCardBg;
  const currentTextColor = editTextColor || '#ffffff';
  const currentBlocks = editBlocks?.length ? editBlocks : ['info', 'stats', 'nav'];

  const hexToRgba = (hex: string, alpha: number) => {
      let r = 0, g = 0, b = 0;
      if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
      } else if (hex.length >= 7) {
        r = parseInt(hex[1] + hex[2], 16);
        g = parseInt(hex[3] + hex[4], 16);
        b = parseInt(hex[5] + hex[6], 16);
      } else {
        return `rgba(20, 20, 20, ${alpha})`;
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const isHex = currentCardBg?.startsWith('#');
  const isImage = currentCardBg && !isHex && !currentCardBg.startsWith('rgb') && !currentCardBg.startsWith('rgba');
  const cardAlpha = currentCardOpacity / 100;

  const cardStyle = {
      backgroundColor: isHex 
          ? hexToRgba(currentCardBg, cardAlpha)
          : (isImage ? `rgba(20, 20, 20, ${1 - cardAlpha})` : (currentCardBg || `rgba(20, 20, 20, ${cardAlpha})`)),
      backgroundImage: isImage 
          ? `linear-gradient(rgba(20,20,20,${1 - cardAlpha}), rgba(20,20,20,${1 - cardAlpha})), url(${currentCardBg})` 
          : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backdropFilter: `blur(${currentCardBlur}px)`,
      WebkitBackdropFilter: `blur(${currentCardBlur}px)`,
      borderColor: currentTheme ? `${currentTheme}40` : undefined,
      color: currentTextColor
  };

  const currentAvatarShape = editAvatarShape;
  const avatarClass = currentAvatarShape === 'square' ? 'rounded-none' : currentAvatarShape === 'rounded' ? 'rounded-2xl' : 'rounded-full';
  const currentBanner = editBanner;
  const currentLayout = editLayout;

  const renderDraggableBlock = (blockId: string, content: React.ReactNode, isHidable: boolean = true, extraClass: string = "") => {
      const pos = isVisualEditMode ? blockPositions[blockId] : user?.profilePositions?.[blockId];
      
      // Hide content block if it's explicitly marked as hidden
      if (blockId === 'content' && editBlocks.includes('hidden:content')) return null;

      return (
         <motion.div
           key={blockId}
           drag={isVisualEditMode}
           dragMomentum={false}
           animate={{ x: pos?.x || 0, y: pos?.y || 0, scale: pos?.scale || 1 }}
           onDragEnd={(e, info) => {
              if (isVisualEditMode) {
                 setBlockPositions(prev => ({
                    ...prev,
                    [blockId]: {
                       ...prev[blockId],
                       x: (prev[blockId]?.x || 0) + info.offset.x,
                       y: (prev[blockId]?.y || 0) + info.offset.y
                    }
                 }));
              }
           }}
           style={{ zIndex: isVisualEditMode ? 50 : 10, position: 'relative', transformOrigin: 'top center', width: '100%' }}
           className={`${extraClass} ${isVisualEditMode ? "cursor-grab active:cursor-grabbing hover:ring-2 ring-primary transition-shadow rounded-3xl group" : ""}`}
         >
           {isVisualEditMode && (
              <>
                {isHidable && (
                  <button 
                    onClick={(e) => {
                       e.stopPropagation();
                       const isBlockInList = editBlocks.some(b => b === blockId || b === `hidden:${blockId}`);
                       if (isBlockInList) {
                           setEditBlocks(editBlocks.map(b => b === blockId ? `hidden:${blockId}` : b));
                       } else {
                           setEditBlocks([...editBlocks, `hidden:${blockId}`]);
                       }
                    }}
                    className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-xl z-50 cursor-pointer transition-transform hover:scale-110 opacity-0 group-hover:opacity-100"
                  >
                     <X className="w-4 h-4" />
                  </button>
                )}
                
                <div className="absolute -bottom-4 right-4 flex gap-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 p-1 rounded-xl shadow-2xl backdrop-blur-md border border-white/10">
                   <button
                      onClick={(e) => {
                         e.stopPropagation();
                         setBlockPositions(prev => ({
                            ...prev,
                            [blockId]: {
                               ...prev[blockId],
                               x: prev[blockId]?.x || 0,
                               y: prev[blockId]?.y || 0,
                               scale: Math.max(0.5, (prev[blockId]?.scale || 1) - 0.05)
                            }
                         }));
                      }}
                      className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                   >
                      -
                   </button>
                   <div className="flex items-center justify-center px-2 text-[10px] font-black text-white/70 w-12 text-center">
                     {Math.round((pos?.scale || 1) * 100)}%
                   </div>
                   <button
                      onClick={(e) => {
                         e.stopPropagation();
                         setBlockPositions(prev => ({
                            ...prev,
                            [blockId]: {
                               ...prev[blockId],
                               x: prev[blockId]?.x || 0,
                               y: prev[blockId]?.y || 0,
                               scale: Math.min(2, (prev[blockId]?.scale || 1) + 0.05)
                            }
                         }));
                      }}
                      className="w-8 h-8 bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                   >
                      +
                   </button>
                </div>
              </>
           )}
           {content}
         </motion.div>
      );
  };

  return (
    <div className="min-h-screen transition-all duration-500" style={containerStyle}>
      <SEO 
        title={`Профиль ${user.name}`} 
        description={`Личный кабинет пользователя ${user.name} на KamiAnime. История просмотров, избранное и настройки.`}
        image={user.avatar}
      />
      
      {/* Top Banner (New Design) */}
      {currentBanner !== 'none' && (
        <div className="h-64 md:h-80 relative overflow-hidden bg-surface" style={{ maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)' }}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface/95 z-10 pointer-events-none"></div>
          {currentBanner ? (
            <img src={currentBanner} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ backgroundColor: currentTheme ? `${currentTheme}33` : '#8b5cf633' }}></div>
          )}
        </div>
      )}

      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20 pb-10 xl:px-0 ${currentBanner === 'none' ? 'pt-24 md:pt-32' : ''}`}>
         <div className={`flex ${currentLayout === 'centered' ? 'flex-col items-center max-w-4xl mx-auto' : currentLayout === 'reversed' ? 'flex-col lg:flex-row-reverse items-start' : 'flex-col lg:flex-row items-start'} gap-8 ${currentBanner !== 'none' ? '-mt-8 md:-mt-12 lg:-mt-16' : ''}`}>
            
            {/* Sidebar Left */}
            <aside className={`w-full ${currentLayout === 'centered' ? 'lg:mx-auto lg:max-w-md' : 'lg:w-80'} flex-shrink-0 mx-auto lg:mx-0 flex flex-col gap-6`}>
               {currentBlocks.map((blockIdFull) => {
                 if (blockIdFull.startsWith('hidden:')) return null;
                 const blockId = blockIdFull;
                 
                 if (blockId === 'info') return renderDraggableBlock('info', (
                   <div key="info" className="border border-white/5 rounded-3xl p-6 relative overflow-hidden transition-all duration-500 shadow-2xl" id="profile-card-info" style={cardStyle}>
                      {/* Avatar */}
                      <div className="relative group mx-auto w-fit mb-6">
                        <div className={`relative w-40 h-40 md:w-48 md:h-48 ${avatarClass} overflow-hidden border-4 border-surface shadow-2xl z-10`} style={{ borderColor: currentTheme || '#8b5cf6' }}>
                          <img 
                             src={editAvatar || user.avatar} 
                             alt={user.name} 
                             className="w-full h-full object-cover" 
                          />
                          
                          <label className={`absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer ${avatarClass}`}>
                            {isUploading ? <Loader2 className="w-8 h-8 text-white animate-spin" /> : <Camera className="w-8 h-8 text-white" />}
                            <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} disabled={isUploading} />
                          </label>
                        </div>
                      </div>
                      
                      {uploadError && <p className="text-[10px] text-red-500 font-bold uppercase mb-4 text-center z-10 relative">{uploadError}</p>}
                      
                      <h1 className="text-2xl font-black uppercase tracking-tight text-center z-10 relative">{user.name}</h1>
                      <div className="flex flex-col items-center gap-3 mt-3 z-10 relative">
                         <span className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-xl border tracking-widest bg-primary/20 text-primary border-primary/20`} style={{ color: currentTheme, borderColor: currentTheme, backgroundColor: currentTheme ? `${currentTheme}33` : undefined }}>
                            Пользователь
                         </span>
                      </div>
                      {user.bio && <p className="mt-5 opacity-80 text-sm leading-relaxed text-center z-10 relative">"{user.bio}"</p>}
                   </div>
                 ));
                 
                 if (blockId === 'stats') return renderDraggableBlock('stats', (
                   <div key="stats" className="border border-white/5 rounded-3xl p-6 relative overflow-hidden transition-all duration-500 shadow-2xl flex flex-col gap-3 text-left" id="profile-card-stats" style={cardStyle}>
                       <div className="flex items-center gap-3 opacity-90">
                           <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: currentTheme ? `${currentTheme}33` : '#8b5cf633' }}>
                              <CheckCircle className="w-4 h-4" style={{ color: currentTheme || '#8b5cf6' }} />
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Просмотрено</span>
                              <span className="font-black text-sm">{watchStats.episodes} серий</span>
                           </div>
                       </div>
                       <div className="flex items-center gap-3 opacity-90">
                           <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                              <History className="w-4 h-4 text-green-500" />
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">Потрачено</span>
                              <span className="font-black text-sm">{watchStats.hours} часов</span>
                           </div>
                       </div>
                   </div>
                 ));
                 
                 if (blockId === 'nav') return renderDraggableBlock('nav', (
                   <nav key="nav" className="rounded-3xl p-3 space-y-2 border shadow-xl transition-all duration-500" style={cardStyle}>
                      <button onClick={() => setActiveTab('favs')} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${activeTab === 'favs' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'favs' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                        <div className="flex items-center gap-3"><Heart className="w-5 h-5 fill-current" /><span className="font-black text-[10px] uppercase tracking-widest">Избранное</span></div>
                        <span className="text-[10px] font-black bg-black/20 px-2 py-0.5 rounded-lg">{allFavIds.length}</span>
                      </button>
                      <button onClick={() => setActiveTab('watched')} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${activeTab === 'watched' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'watched' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                        <div className="flex items-center gap-3"><CheckCircle className="w-5 h-5 fill-current" /><span className="font-black text-[10px] uppercase tracking-widest">Просмотрено</span></div>
                        <span className="text-[10px] font-black bg-black/20 px-2 py-0.5 rounded-lg">{allWatchedIds.length}</span>
                      </button>
                      <button onClick={() => setActiveTab('watching')} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${activeTab === 'watching' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'watching' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                        <div className="flex items-center gap-3"><PlayCircle className="w-5 h-5 fill-current" /><span className="font-black text-[10px] uppercase tracking-widest">Смотрю</span></div>
                        <span className="text-[10px] font-black bg-black/20 px-2 py-0.5 rounded-lg">{allWatchingIds.length}</span>
                      </button>
                      <button onClick={() => setActiveTab('dropped')} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${activeTab === 'dropped' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'dropped' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                        <div className="flex items-center gap-3"><X className="w-5 h-5" /><span className="font-black text-[10px] uppercase tracking-widest">Брошено</span></div>
                        <span className="text-[10px] font-black bg-black/20 px-2 py-0.5 rounded-lg">{allDroppedIds.length}</span>
                      </button>
                      <button onClick={() => setActiveTab('history')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeTab === 'history' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'history' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                        <History className="w-5 h-5" /><span className="font-black text-[10px] uppercase tracking-widest">История</span>
                      </button>
                      <button onClick={() => setActiveTab('friends')} className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all ${activeTab === 'friends' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'friends' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                        <div className="flex items-center gap-3"><Users className="w-5 h-5" /><span className="font-black text-[10px] uppercase tracking-widest">Друзья</span></div>
                        <span className="text-[10px] font-black bg-black/20 px-2 py-0.5 rounded-lg">{friends.length}</span>
                      </button>
                      {!isVisualEditMode && (
                         <>
                            <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeTab === 'settings' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'settings' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                              <Settings className="w-5 h-5" /><span className="font-black text-[10px] uppercase tracking-widest">Настройки</span>
                            </button>
                            <button onClick={() => setActiveTab('integrations')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeTab === 'integrations' ? 'opacity-100' : 'opacity-60 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'integrations' ? { backgroundColor: currentTheme || '#8b5cf6', color: '#fff' } : {}}>
                              <img src="https://shikimori.one/favicon.ico" alt="Shi" className="w-5 h-5 rounded grayscale opacity-50" style={activeTab === 'integrations' ? { filter: 'none', opacity: 1 } : {}} onError={(e) => { e.currentTarget.style.display = 'none'; }} /><span className="font-black text-[10px] uppercase tracking-widest">Интеграции</span>
                            </button>
                            <button onClick={() => setActiveTab('design')} className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all ${activeTab === 'design' ? 'opacity-100' : 'text-yellow-500 opacity-80 hover:opacity-100 hover:bg-white/5'}`} style={activeTab === 'design' ? { backgroundColor: '#eab308', color: '#000' } : {}}>
                              <Palette className="w-5 h-5" /><span className="font-black text-[10px] uppercase tracking-widest">Дизайн</span>
                            </button>
                         </>
                      )}
                   </nav>
                 ));
                 return null;
               })}
            </aside>

            {/* Main Content Area */}
            {renderDraggableBlock('content', (
               <div className="space-y-12 w-full min-w-0 pt-0">
               {isLoading ? (
                 <div className="flex justify-center py-32"><Loader2 className="w-12 h-12 animate-spin" style={{ color: currentTheme || '#8b5cf6' }} /></div>
               ) : activeTab === 'settings' ? (
                 <section className="space-y-8 animate-in fade-in duration-500">
                    <div className="flex items-center justify-between">
                      <div>
                          <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Настройки профиля</h3>
                          <p className="text-sm text-slate-400 mt-1">Управляйте своими личными данными.</p>
                      </div>
                      <div className="flex items-center gap-4">
                        {isEditing ? (
                          <>
                            <button 
                              onClick={() => {
                                setIsEditing(false);
                                setEditName(user.name);
                                setEditBio(user.bio || '');
                                setEditAvatar(user.avatar);
                              }}
                              className="px-5 py-2.5 bg-surface text-slate-300 rounded-xl font-bold text-sm hover:text-white transition-colors"
                            >
                              Отмена
                            </button>
                            <button 
                              onClick={handleSaveProfile}
                              disabled={isActionLoading}
                              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg disabled:opacity-50 hover:opacity-90 transition-opacity"
                              style={{ backgroundColor: currentTheme || undefined, boxShadow: currentTheme ? `0 4px 14px 0 ${currentTheme}40` : undefined }}
                            >
                              {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              Сохранить
                            </button>
                          </>
                        ) : (
                          <button 
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: currentTheme || undefined, boxShadow: currentTheme ? `0 4px 14px 0 ${currentTheme}40` : undefined }}
                          >
                            <Edit2 className="w-4 h-4" /> Редактировать
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="bg-surface/50 backdrop-blur-md border border-white/5 rounded-[2rem] p-8 md:p-10 shadow-xl relative overflow-hidden" style={cardStyle}>
                      <div className="grid gap-12 max-w-3xl">
                        
                        {/* Avatar Settings */}
                        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                          <div className="relative group shrink-0">
                            <img src={editAvatar} loading="lazy" alt="Avatar Preview" className="w-28 h-28 rounded-full object-cover border-4 border-surface shadow-xl" />
                            {isEditing && (
                              <button 
                                onClick={() => fileInputRef.current?.click()} 
                                disabled={isUploading} 
                                className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm cursor-pointer"
                              >
                                {isUploading ? <Loader2 className="w-6 h-6 text-white animate-spin mb-1" /> : <Camera className="w-6 h-6 text-white mb-1" />}
                                <span className="text-[10px] font-bold text-white uppercase">Изменить</span>
                              </button>
                            )}
                          </div>
                          <div className="flex-1 space-y-2">
                            <h4 className="text-base font-bold text-white">Аватар профиля</h4>
                            <p className="text-sm text-slate-400 leading-relaxed md:max-w-md">Рекомендуемый размер 256x256 пикселей. Форматы: JPG, PNG, GIF. Максимальный размер файла — 10MB.</p>
                            {isEditing && (
                                <div className="pt-2">
                                    <button 
                                      onClick={() => fileInputRef.current?.click()} 
                                      disabled={isUploading} 
                                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-medium border border-white/10 transition-all flex items-center gap-2"
                                    >
                                        <Upload className="w-4 h-4" /> Загрузить
                                    </button>
                                    <input 
                                        ref={fileInputRef}
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*" 
                                        onChange={handleAvatarUpload} 
                                    />
                                </div>
                            )}
                          </div>
                        </div>

                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>

                        {/* Name Setting */}
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-bold text-white mb-1 block">Имя пользователя</label>
                            <p className="text-[13px] text-slate-400">Отображается в вашем профиле, друзьях и чатах.</p>
                          </div>
                          <input 
                            type="text" 
                            disabled={!isEditing}
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="w-full h-14 px-5 bg-black/20 border border-white/10 rounded-2xl text-white focus:border-primary focus:bg-black/40 outline-none disabled:opacity-50 transition-all font-medium"
                          />
                        </div>
                        
                        {/* Bio Setting */}
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-bold text-white mb-1 block">О себе</label>
                            <p className="text-[13px] text-slate-400">Напишите пару слов о себе, своих любимых жанрах или любимом аниме.</p>
                          </div>
                          <textarea 
                            disabled={!isEditing}
                            value={editBio}
                            onChange={e => setEditBio(e.target.value)}
                            placeholder="Расскажите о себе..."
                            className="w-full p-5 min-h-[120px] bg-black/20 border border-white/10 rounded-2xl text-white focus:border-primary focus:bg-black/40 outline-none disabled:opacity-50 transition-all font-medium resize-y"
                          />
                        </div>

                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-4"></div>

                        {/* Cache & Local Storage Settings */}
                        <div className="space-y-6">
                          <div>
                            <label className="text-sm font-bold text-white mb-1 block">Очистка кэша и локальных данных</label>
                            <p className="text-[13px] text-slate-400">
                              Очистите сохраненные обложки аниме, результаты поиска, главы манги и временный кэш запросов, чтобы начать их сбор заново. Данные вашего профиля и авторизации не пострадают.
                            </p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-black/20 border border-white/5 rounded-2xl">
                            <div>
                              <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Используется кэшем в браузере:</span>
                              <span className="text-lg font-extrabold text-white mt-1 block">
                                {cacheSizeKB > 1024 ? `${(cacheSizeKB / 1024).toFixed(2)} MB` : `${cacheSizeKB} KB`}
                              </span>
                            </div>
                            
                            <button
                              type="button"
                              onClick={async () => {
                                setIsClearingCache(true);
                                try {
                                  // Remove cache items
                                  const keysToRemove: string[] = [];
                                  for (let i = 0; i < localStorage.length; i++) {
                                    const key = localStorage.key(i);
                                    if (key && (key.startsWith('as_cache_') || key.startsWith('as_manga_') || key.includes('cache'))) {
                                      keysToRemove.push(key);
                                    }
                                  }
                                  keysToRemove.forEach(k => localStorage.removeItem(k));
                                  
                                  // Clear service worker caches
                                  if ('caches' in window) {
                                    const cacheNames = await caches.keys();
                                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                                  }
                                  
                                  // Clear session storage
                                  sessionStorage.clear();
                                  
                                  setCacheSuccessMsg('Кэш сайта полностью очищен! Страница будет перезагружена...');
                                  
                                  setTimeout(() => {
                                    window.location.reload();
                                  }, 1500);
                                } catch (e: any) {
                                  setCacheSuccessMsg('Ошибка при очистке: ' + e.message);
                                } finally {
                                  setIsClearingCache(false);
                                }
                              }}
                              disabled={isClearingCache || (cacheSizeKB === 0 && !cacheSuccessMsg)}
                              className="px-5 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto text-center cursor-pointer"
                            >
                              {isClearingCache ? 'Очищаю кэш...' : 'Очистить весь кэш сайта'}
                            </button>
                          </div>
                          {cacheSuccessMsg && (
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-400 text-center animate-pulse">
                              {cacheSuccessMsg}
                            </div>
                          )}

                          {user?.role === 'admin' && (
                            <>
                              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-2"></div>

                              {/* Server-Side Cache */}
                              <div>
                                <label className="text-sm font-bold text-white mb-1 block">Очистка серверного кэша</label>
                                <p className="text-[13px] text-slate-400">
                                  Сервер оптимизирует работу, временно сохраняя в оперативной памяти ссылки на обложки (Jikan/Shikimori), данные обхода рейтинга и прокси-соединения. Сброс заставит сервер очистить ОЗУ-кэш и запрашивать всё с чистого листа. Доступно только администраторам.
                                </p>
                              </div>

                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 bg-black/20 border border-white/5 rounded-2xl">
                                <div>
                                  <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider block">Провайдер кэширования:</span>
                                  <span className="text-[13px] font-semibold text-slate-300 mt-1 block">
                                    Внутренняя память RAM (Hono-сервер)
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={async () => {
                                    setIsClearingServerCache(true);
                                    setServerCacheSuccessMsg('');
                                    try {
                                      const res = await fetch('/api/clear-server-cache', {
                                        method: 'POST'
                                      });
                                      const data = await res.json();
                                      setServerCacheSuccessMsg(data.message || 'Серверный кэш успешно сброшен!');
                                    } catch (e: any) {
                                      setServerCacheSuccessMsg('Ошибка при сбросе: ' + e.message);
                                    } finally {
                                      setIsClearingServerCache(false);
                                    }
                                  }}
                                  disabled={isClearingServerCache}
                                  className="px-5 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto text-center cursor-pointer"
                                >
                                  {isClearingServerCache ? 'Сбрасываю...' : 'Сбросить серверный кэш'}
                                </button>
                              </div>

                              {serverCacheSuccessMsg && (
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-400 text-center animate-pulse">
                                  {serverCacheSuccessMsg}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                      </div>
                    </div>
                 </section>
               ) : activeTab === 'design' ? (
                 <section className="p-10 rounded-[2.5rem] border shadow-2xl animate-in fade-in duration-500" style={cardStyle}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
                      <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Дизайн профиля</h3>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={handleSaveProfile}
                          disabled={isActionLoading}
                          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:opacity-90 transition-opacity border flex-grow md:flex-grow-0"
                          style={{ backgroundColor: currentTheme || '#8b5cf6', borderColor: currentTheme ? `${currentTheme}40` : '#8b5cf640', boxShadow: currentTheme ? `0 4px 14px 0 ${currentTheme}40` : undefined }}
                        >
                          {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Сохранить изменения
                        </button>
                        <button 
                          onClick={() => setActiveTab('favs')} 
                          className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10 text-slate-300 hover:text-white shrink-0"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      {/* Banner Setting */}
                      <div className="space-y-4 md:col-span-2">
                         <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Баннер профиля (URL или Файл)</label>
                         <div className="flex flex-col md:flex-row items-center gap-6">
                           <div className="w-full md:w-64 h-32 bg-black/20 rounded-2xl border border-white/10 overflow-hidden relative group shrink-0">
                             {editBanner && editBanner !== 'none' ? (
                               <img src={editBanner} alt="Banner Preview" className="w-full h-full object-cover" />
                             ) : editBanner === 'none' ? (
                               <div className="w-full h-full flex flex-col items-center justify-center bg-black/40">
                                 <X className="w-8 h-8 text-red-500 mb-2" />
                                 <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Баннер скрыт</span>
                               </div>
                             ) : (
                               <div className="w-full h-full flex items-center justify-center">
                                 <ImageIcon className="w-8 h-8 text-slate-600" />
                               </div>
                             )}
                           </div>
                           <div className="flex-1 space-y-3 w-full">
                              <div className="relative">
                                <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                                <input 
                                  type="text" 
                                  value={editBanner === 'none' ? '' : editBanner} 
                                  onChange={(e) => setEditBanner(e.target.value)} 
                                  placeholder="https://example.com/banner.jpg" 
                                  disabled={editBanner === 'none'}
                                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none transition-all disabled:opacity-50" 
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-4">
                                <button onClick={() => bannerInputRef.current?.click()} disabled={isUploadingBanner || editBanner === 'none'} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shrink-0 disabled:opacity-50">
                                   {isUploadingBanner ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3" />} Загрузить
                                </button>
                                <button onClick={() => setEditBanner('')} disabled={editBanner === 'none'} className="px-4 py-2 bg-white/5 hover:bg-red-500/20 text-red-400 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 disabled:opacity-50">
                                   <X className="w-3 h-3" /> Очистить
                                </button>
                                <button onClick={() => setEditBanner(editBanner === 'none' ? '' : 'none')} className="px-4 py-2 bg-white/5 hover:bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0">
                                   {editBanner === 'none' ? 'Показать баннер' : <><X className="w-3 h-3" /> Скрыть баннер</>}
                                </button>
                                <input type="file" ref={bannerInputRef} className="hidden" accept="image/*" onChange={handleBannerUpload} />
                              </div>
                           </div>
                         </div>
                      </div>

                      {/* Background Image */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Фоновое изображение (URL или Файл)</label>
                        <div className="relative">
                          <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                          <input 
                            type="text" 
                            value={editBg} 
                            onChange={(e) => setEditBg(e.target.value)} 
                            placeholder="https://example.com/background.jpg" 
                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none transition-all" 
                            style={{ focus: { borderColor: currentTheme || '#8b5cf6' } } as React.CSSProperties}
                          />
                        </div>
                        <div className="flex items-center gap-4">
                           <p className="text-[10px] text-slate-500 ml-2 flex-1">Ссылка на изображение для фона всего профиля.</p>
                           <button onClick={() => bgInputRef.current?.click()} disabled={isUploadingBg} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shrink-0">
                               {isUploadingBg ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3" />} Загрузить
                           </button>
                           <button onClick={() => setEditBg('')} className="px-4 py-2 bg-white/5 hover:bg-red-500/20 text-red-400 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0">
                               <X className="w-3 h-3" /> Очистить
                           </button>
                           <input type="file" ref={bgInputRef} className="hidden" accept="image/*" onChange={handleBgUpload} />
                        </div>
                      </div>

                      {/* Theme Color */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Акцентный цвет</label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="color" 
                            value={editTheme} 
                            onChange={(e) => setEditTheme(e.target.value)}
                            className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0 bg-transparent"
                          />
                          <div className="flex-1">
                             <input 
                                type="text" 
                                value={editTheme} 
                                onChange={(e) => setEditTheme(e.target.value)} 
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-sm text-white font-mono uppercase focus:outline-none transition-all"
                                style={{ focus: { borderColor: currentTheme || '#8b5cf6' } } as React.CSSProperties}
                             />
                          </div>
                        </div>
                      </div>

                      {/* Text Color */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Цвет текста</label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="color" 
                            value={editTextColor} 
                            onChange={(e) => setEditTextColor(e.target.value)}
                            className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0 bg-transparent"
                          />
                          <div className="flex-1">
                             <input 
                                type="text" 
                                value={editTextColor} 
                                onChange={(e) => setEditTextColor(e.target.value)} 
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 text-sm text-white font-mono uppercase focus:outline-none transition-all"
                                style={{ focus: { borderColor: currentTheme || '#8b5cf6' } } as React.CSSProperties}
                             />
                          </div>
                        </div>
                      </div>

                      {/* Card Bg */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Фон карточек (Цвет или URL)</label>
                        <div className="flex items-center gap-4">
                           <input 
                              type="color" 
                              value={editCardBg && editCardBg.startsWith('#') ? editCardBg : '#141414'} 
                              onChange={(e) => setEditCardBg(e.target.value)}
                              className="w-12 h-12 rounded-xl cursor-pointer border-0 p-0 bg-transparent shrink-0"
                            />
                            <div className="relative flex-1">
                              <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                              <input 
                                type="text" 
                                value={editCardBg} 
                                onChange={(e) => setEditCardBg(e.target.value)} 
                                placeholder="#000000 или URL картинки" 
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:outline-none transition-all" 
                                style={{ focus: { borderColor: currentTheme || '#8b5cf6' } } as React.CSSProperties}
                              />
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <p className="text-[10px] text-slate-500 ml-2 flex-1">Цвет или картинка для фона.</p>
                            <button onClick={() => cardBgInputRef.current?.click()} disabled={isUploadingCardBg} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-2 shrink-0">
                               {isUploadingCardBg ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3" />} Загрузить
                           </button>
                           <button onClick={() => setEditCardBg('')} className="px-4 py-2 bg-white/5 hover:bg-red-500/20 text-red-400 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0">
                               <X className="w-3 h-3" /> Очистить
                           </button>
                           <input type="file" ref={cardBgInputRef} className="hidden" accept="image/*" onChange={handleCardBgUpload} />
                        </div>
                      </div>

                      {/* Layout */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Макет профиля</label>
                        <div className="grid grid-cols-3 gap-3">
                          <button 
                            onClick={() => setEditLayout('standard')}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${editLayout === 'standard' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            style={editLayout === 'standard' ? { color: currentTheme || undefined, borderColor: currentTheme || undefined, backgroundColor: currentTheme ? `${currentTheme}1A` : undefined } : {}}
                          >
                            <LayoutTemplate className="w-6 h-6" />
                            <span className="text-[10px] font-bold uppercase">Стандарт</span>
                          </button>
                          <button 
                            onClick={() => setEditLayout('reversed')}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${editLayout === 'reversed' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            style={editLayout === 'reversed' ? { color: currentTheme || undefined, borderColor: currentTheme || undefined, backgroundColor: currentTheme ? `${currentTheme}1A` : undefined } : {}}
                          >
                            <LayoutTemplate className="w-6 h-6 rotate-180" />
                            <span className="text-[10px] font-bold uppercase">Реверс</span>
                          </button>
                          <button 
                            onClick={() => setEditLayout('centered')}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${editLayout === 'centered' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            style={editLayout === 'centered' ? { color: currentTheme || undefined, borderColor: currentTheme || undefined, backgroundColor: currentTheme ? `${currentTheme}1A` : undefined } : {}}
                          >
                            <Grid className="w-6 h-6" />
                            <span className="text-[10px] font-bold uppercase">Центр</span>
                          </button>
                        </div>
                        <div className="mt-4 p-4 rounded-xl border border-white/10 bg-black/20 space-y-3">
                          <p className="text-xs text-slate-400 mb-2">Управление блоками сайдбара (порядок и видимость):</p>
                          {editBlocks.map((blockIdFull, index) => {
                             const isHidden = blockIdFull.startsWith('hidden:');
                             const blockId = isHidden ? blockIdFull.replace('hidden:', '') : blockIdFull;
                             const blockName = blockId === 'info' ? 'Инфо (Аватар)' : blockId === 'stats' ? 'Статистика' : blockId === 'nav' ? 'Навигация' : blockId;
                             
                             return (
                               <div key={blockId} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                                 <div className="flex items-center gap-3">
                                   <button 
                                     onClick={(e) => {
                                        e.preventDefault();
                                        const newBlocks = [...editBlocks];
                                        newBlocks[index] = isHidden ? blockId : `hidden:${blockId}`;
                                        setEditBlocks(newBlocks);
                                     }}
                                     className={`p-1.5 rounded-md ${isHidden ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}
                                   >
                                     {isHidden ? <X className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                                   </button>
                                   <span className={`text-sm font-bold ${isHidden ? 'text-slate-500 line-through' : 'text-white'}`}>{blockName}</span>
                                 </div>
                                 <div className="flex items-center gap-1">
                                    <button 
                                      disabled={index === 0}
                                      onClick={(e) => {
                                         e.preventDefault();
                                         const newBlocks = [...editBlocks];
                                         const temp = newBlocks[index];
                                         newBlocks[index] = newBlocks[index - 1];
                                         newBlocks[index - 1] = temp;
                                         setEditBlocks(newBlocks);
                                      }}
                                      className="p-1.5 bg-white/5 hover:bg-white/10 text-white rounded disabled:opacity-30"
                                    >
                                      <ChevronUp className="w-4 h-4" />
                                    </button>
                                    <button 
                                      disabled={index === editBlocks.length - 1}
                                      onClick={(e) => {
                                         e.preventDefault();
                                         const newBlocks = [...editBlocks];
                                         const temp = newBlocks[index];
                                         newBlocks[index] = newBlocks[index + 1];
                                         newBlocks[index + 1] = temp;
                                         setEditBlocks(newBlocks);
                                      }}
                                      className="p-1.5 bg-white/5 hover:bg-white/10 text-white rounded disabled:opacity-30"
                                    >
                                      <ChevronDown className="w-4 h-4" />
                                    </button>
                                 </div>
                               </div>
                             );
                          })}
                        </div>
                        <button
                          onClick={(e) => {
                             e.preventDefault();
                             setIsEditing(false);
                             setIsVisualEditMode(true);
                             if (['settings', 'design', 'integrations'].includes(activeTab)) {
                               setActiveTab('favs');
                             }
                          }}
                          className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-bold text-white transition-all"
                        >
                          <Layout className="w-4 h-4" /> Визуальный конструктор
                        </button>
                      </div>

                      {/* Avatar Shape */}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Форма аватара</label>
                        <div className="grid grid-cols-3 gap-3">
                          <button 
                            onClick={() => setEditAvatarShape('round')}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${editAvatarShape === 'round' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            style={editAvatarShape === 'round' ? { color: currentTheme || undefined, borderColor: currentTheme || undefined, backgroundColor: currentTheme ? `${currentTheme}1A` : undefined } : {}}
                          >
                            <div className="w-6 h-6 rounded-full bg-current opacity-50"></div>
                            <span className="text-[10px] font-bold uppercase">Круг</span>
                          </button>
                          <button 
                            onClick={() => setEditAvatarShape('rounded')}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${editAvatarShape === 'rounded' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            style={editAvatarShape === 'rounded' ? { color: currentTheme || undefined, borderColor: currentTheme || undefined, backgroundColor: currentTheme ? `${currentTheme}1A` : undefined } : {}}
                          >
                            <div className="w-6 h-6 rounded-lg bg-current opacity-50"></div>
                            <span className="text-[10px] font-bold uppercase">Скругленный</span>
                          </button>
                          <button 
                            onClick={() => setEditAvatarShape('square')}
                            className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${editAvatarShape === 'square' ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                            style={editAvatarShape === 'square' ? { color: currentTheme || undefined, borderColor: currentTheme || undefined, backgroundColor: currentTheme ? `${currentTheme}1A` : undefined } : {}}
                          >
                            <div className="w-6 h-6 rounded-none bg-current opacity-50"></div>
                            <span className="text-[10px] font-bold uppercase">Квадрат</span>
                          </button>
                        </div>
                      </div>

                      {/* Card Opacity & Blur */}
                      <div className="space-y-4">
                         <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Прозрачность карточек: {editCardOpacity}%</label>
                         <input 
                            type="range" 
                            min="20" 
                            max="100" 
                            value={editCardOpacity} 
                            onChange={(e) => setEditCardOpacity(Number(e.target.value))}
                            className="w-full accent-yellow-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                         />
                      </div>

                      <div className="space-y-4">
                         <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Размытие фона (Blur): {editCardBlur}px</label>
                         <input 
                            type="range" 
                            min="0" 
                            max="40" 
                            value={editCardBlur} 
                            onChange={(e) => setEditCardBlur(Number(e.target.value))}
                            className="w-full accent-yellow-500 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                         />
                      </div>

                    </div>
                 </section>
               ) : activeTab === 'integrations' ? (
                 <section className="p-10 rounded-[2.5rem] border shadow-2xl animate-in fade-in duration-500" style={cardStyle}>
                     <h3 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter mb-4">
                        Интеграции
                     </h3>
                     <p className="text-slate-400 text-sm mb-6 max-w-xl">
                        Синхронизируйте свои списки (Просмотрено, Смотрю, Брошено) с Shikimori. Оценки и серии будут обновляться автоматически при просмотре или изменении статуса. Авто-отметка серий работает при просмотре в плеере Kodik (будет обновляться время просмотра и отмечаться новая серия).
                     </p>

                     {user.shikimoriId ? (
                         <div className="space-y-4">
                             <div className="flex items-center justify-between p-5 bg-[#000000] border border-blue-500/30 rounded-2xl">
                                <div className="flex items-center gap-4">
                                  <div className="bg-blue-500/20 p-3 rounded-xl border border-blue-500/50">
                                     <img src="https://shikimori.one/favicon.ico" alt="Shi" className="w-5 h-5 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                  </div>
                                  <div>
                                     <p className="text-white font-bold text-sm">Shikimori привязан</p>
                                     <p className="text-slate-500 text-[10px] uppercase font-black tracking-wider">ID: {user.shikimoriId}</p>
                                  </div>
                                </div>
                                <button
                                   onClick={async () => {
                                      setIsActionLoading(true);
                                      try {
                                         const res = await fetch('/api/shikimori/import', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email: user.email })
                                         });
                                         const data = await res.json();
                                         if (data.success) {
                                            alert(`Успешно синхронизировано!\nПросмотрено: ${data.watched}\nСмотрю: ${data.watching}\nБрошено: ${data.dropped}`);
                                            window.location.reload();
                                         } else {
                                            alert(`Ошибка синхронизации: ${data.error}`);
                                         }
                                      } catch(e) {
                                         alert('Сетевая ошибка при синхронизации');
                                      } finally {
                                         setIsActionLoading(false);
                                      }
                                   }}
                                   className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                                >
                                   Синхронизировать списки
                                </button>
                             </div>
                         </div>
                     ) : (
                         <div className="space-y-4">
                             <button 
                                type="button"
                                onClick={() => {
                                   const shikimoriClientId = "kI3V5SN4EtzP_DaAjykHoXVdJJVCe2XPW-q0qiDcmig";
                                   window.location.href = `https://shikimori.one/oauth/authorize?client_id=${shikimoriClientId}&redirect_uri=${encodeURIComponent(window.location.origin + '/profile')}&response_type=code`;
                                }}
                                className="flex items-center gap-3 px-6 py-4 bg-[#212121] hover:bg-blue-600 border border-blue-500/30 rounded-2xl text-white font-black text-[11px] uppercase tracking-widest transition-all"
                             >
                                <img src="https://shikimori.one/favicon.ico" alt="Shi" className="w-5 h-5 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                Привязать аккаунт Shikimori
                             </button>

                             <div className="p-4 rounded-xl border border-white/10 bg-white/5 space-y-3 max-w-xl">
                               <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/10">
                                 <input 
                                   type="text" 
                                   id="manual-code"
                                   placeholder="Или введите код вручную (oob)" 
                                   className="bg-black/50 border border-white/10 rounded-lg px-3 flex-1 h-9 text-sm text-white" 
                                 />
                                 <button 
                                   onClick={() => {
                                     const input = document.getElementById('manual-code') as HTMLInputElement;
                                     if (input && input.value) {
                                        window.location.href = window.location.pathname + '?code=' + encodeURIComponent(input.value) + '&manual=1';
                                     }
                                   }}
                                   className="bg-blue-600 hover:bg-blue-500 text-white px-4 h-9 rounded-lg text-xs font-bold"
                                 >
                                   Ok
                                 </button>
                               </div>
                             </div>
                         </div>
                     )}
                 </section>
               ) : activeTab === 'friends' ? (
                 <section className="animate-in fade-in duration-500">
                    <h3 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter mb-8">
                       <Users className="text-primary" /> Список друзей
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {friends.length > 0 ? friends.map((friend: any, idx: number) => (
                        <div key={idx} className="glass p-6 rounded-[2rem] border border-white/5 flex items-center gap-4 group hover:border-primary/30 transition-all">
                          <img src={friend.avatar} loading="lazy" className="w-14 h-14 rounded-2xl object-cover" alt="" />
                          <div className="flex-grow">
                            <h4 className="text-white font-black uppercase tracking-tighter">{friend.name}</h4>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{friend.email}</p>
                          </div>
                          <Link aria-label="Send message" to={`/user/${friend.id || friend.email}`} className="p-3 bg-white/5 hover:bg-primary text-slate-400 hover:text-white rounded-xl transition-all">
                            <UserIcon className="w-5 h-5" />
                          </Link>
                        </div>
                      )) : (
                        <div className="col-span-full p-16 text-center glass rounded-[2rem] border border-white/5">
                          <Users className="w-12 h-12 text-slate-800 mx-auto mb-4" />
                          <p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Друзей пока нет</p>
                        </div>
                      )}
                    </div>
                 </section>
               ) : (
                 <section className="animate-in fade-in duration-500">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                      <h3 className="text-2xl font-black text-white flex items-center gap-3 uppercase tracking-tighter">
                         {activeTab === 'favs' ? <Heart className="text-primary" /> : activeTab === 'watched' ? <CheckCircle className="text-primary" /> : activeTab === 'watching' ? <PlayCircle className="text-primary" /> : activeTab === 'dropped' ? <X className="text-primary" /> : <History className="text-primary" />} 
                         {activeTab === 'favs' ? 'Избранное' : activeTab === 'watched' ? 'Просмотрено' : activeTab === 'watching' ? 'Смотрю' : activeTab === 'dropped' ? 'Брошено' : 'История просмотров'}
                      </h3>
                      
                      {['favs', 'watched', 'watching', 'dropped'].includes(activeTab) && (
                         <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="relative flex-grow sm:w-64">
                               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                               <input 
                                  type="text" 
                                  placeholder="Поиск по списку..." 
                                  value={searchQuery}
                                  onChange={(e) => setSearchQuery(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-primary outline-none transition-all placeholder:text-slate-500 font-bold"
                               />
                            </div>
                            <div className="relative shrink-0">
                               <select 
                                  value={sortOrder}
                                  onChange={(e) => setSortOrder(e.target.value)}
                                  className="appearance-none bg-black/50 border border-white/10 rounded-2xl py-2.5 pl-10 pr-8 text-sm text-white font-bold focus:border-primary outline-none transition-all cursor-pointer"
                               >
                                  <option value="popularity" className="bg-[#1a1a1a] text-white">Популярные</option>
                                  <option value="ranked" className="bg-[#1a1a1a] text-white">По рейтингу</option>
                                  <option value="name" className="bg-[#1a1a1a] text-white">По алфавиту</option>
                                  <option value="aired_on" className="bg-[#1a1a1a] text-white">По дате выхода</option>
                               </select>
                               <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                               <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none rotate-90" />
                            </div>
                         </div>
                      )}
                    </div>
                    
                    {(searchResults || (activeTab === 'favs' ? favorites : activeTab === 'watched' ? watched : activeTab === 'watching' ? watching : activeTab === 'dropped' ? dropped : [])).length > 0 || (activeTab === 'history' && history.length > 0) ? (
                        <div className={activeTab === 'history' ? "grid gap-4" : "grid grid-cols-2 sm:grid-cols-4 gap-6"}>
                            {isSearching && <div className="col-span-full py-20 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}
                            {!isSearching && (
                              <>
                                {activeTab === 'history' ? history.slice(0, limits.history).map((item: any, idx: number) => (
                                    <Link to={`/watch/${item.animeId}?ep=${item.episode}`} key={idx} className="glass p-4 rounded-3xl flex items-center gap-6 group border border-transparent hover:border-white/10 transition-all">
                                        <div className="w-40 h-24 rounded-2xl overflow-hidden shrink-0">
                                      <img 
                                        src={item.image} 
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" 
                                        alt="" 
                                        onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                                      />
                                    </div>
                                    <div className="flex-grow"><h4 className="text-lg font-black text-white truncate uppercase tracking-tighter">{item.title}</h4><p className="text-xs text-slate-400 font-bold mt-1 uppercase">Серия {item.episode}</p></div>
                                    <PlayCircle className="w-10 h-10 text-primary opacity-0 group-hover:opacity-100 transition-all" />
                                </Link>
                            )) : (searchResults || (activeTab === 'favs' ? favorites : activeTab === 'watched' ? watched : activeTab === 'watching' ? watching : dropped)).map((anime: Anime) => {
                                 const isDmcaBlocked = dmcaBlocks.includes(anime.id.toString());
                                 const isSlugBlocked = slugBlocks.includes(anime.id.toString());
                                 const targetUrl = isDmcaBlocked ? `/anime/${anime.id}-watch` : `/anime/${anime.id}${anime.slug && !isSlugBlocked ? `-${anime.slug}` : ''}`;
                                 return (
                                 <Link to={targetUrl} key={anime.id} className="group relative rounded-3xl overflow-hidden glass border border-transparent hover:border-primary transition-all">
                                   <div className="aspect-[2/3] relative">
                                      <img 
                                        src={anime.image} 
                                        loading="lazy"
                                        className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" 
                                        alt="" 
                                        onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-dark opacity-90"></div>
                                      <div className="absolute bottom-4 left-4 right-4"><h4 className="text-xs font-black text-white truncate uppercase mb-1">{anime.title}</h4><div className="text-[9px] font-black text-primary uppercase">{anime.type}</div></div>
                                   </div>
                                </Link>
                            )})}
                              </>
                            )}
                        </div>
                    ) : (
                        <div className="p-16 text-center glass rounded-[2rem] border border-white/5"><p className="text-slate-500 font-bold uppercase text-xs tracking-widest">Список пуст</p></div>
                    )}
                    {['favs', 'watched', 'watching', 'dropped'].includes(activeTab) && searchResults === null && (
                        (() => {
                           const currentTarget = activeTab === 'favs' ? allFavIds : activeTab === 'watched' ? allWatchedIds : activeTab === 'watching' ? allWatchingIds : allDroppedIds;
                           const currentLimit = limits[activeTab as keyof typeof limits] || 20;
                           if (currentTarget.length > currentLimit) {
                               return (
                                   <div className="flex justify-center mt-12">
                                     <button 
                                        type="button"
                                        onClick={() => setLimits(prev => ({ ...prev, [activeTab]: prev[activeTab as keyof typeof limits] + 20 }))}
                                        className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-300 transition-colors border border-white/10 flex items-center gap-2"
                                     >
                                         Показать еще <ChevronRight className="w-4 h-4" />
                                     </button>
                                   </div>
                               );
                           }
                           return null;
                        })()
                    )}
                    {activeTab === 'history' && history.length > limits.history && (
                        <div className="flex justify-center mt-12">
                           <button 
                                type="button"
                                onClick={() => setLimits(prev => ({ ...prev, history: prev.history + 20 }))}
                                className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-300 transition-colors border border-white/10 flex items-center gap-2"
                             >
                                 Показать еще <ChevronRight className="w-4 h-4" />
                             </button>
                        </div>
                    )}
                 </section>
               )}
               </div>
            ), false, "flex-grow relative z-10 w-full min-w-0")}
         </div>
      </div>
      
      {/* Floating Layout Edit Contols */}
      {user && (
         <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end">
            {isVisualEditMode && (
               <div className="bg-surface border border-white/10 p-4 rounded-3xl shadow-2xl backdrop-blur-xl mb-4 w-72">
                  <h3 className="text-white font-black uppercase text-sm mb-3">Скрытые блоки</h3>
                  <div className="flex flex-wrap gap-2">
                     {['info', 'stats', 'nav', 'content'].filter(id => editBlocks.includes(`hidden:${id}`)).map(id => (
                        <button key={id} onClick={() => {
                           setEditBlocks(editBlocks.map(b => b === `hidden:${id}` ? id : b));
                        }} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all capitalize">
                           + {id === 'info' ? 'Инфо' : id === 'stats' ? 'Статистика' : id === 'nav' ? 'Навигация' : id === 'content' ? 'Основной Контент' : id}
                        </button>
                     ))}
                     {['info', 'stats', 'nav', 'content'].filter(id => editBlocks.includes(`hidden:${id}`)).length === 0 && (
                        <p className="text-xs text-slate-500 italic">Нет скрытых блоков</p>
                     )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                     <button onClick={async () => {
                         await updateProfile({ profileBlocks: editBlocks, profilePositions: blockPositions });
                         setIsVisualEditMode(false);
                     }} className="w-full py-2 bg-primary hover:bg-primary/80 text-white rounded-xl text-sm font-bold shadow-lg transition-all flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> Сохранить макет
                     </button>
                     <button onClick={() => {
                         setEditBlocks(user?.profileBlocks?.length ? user.profileBlocks : ['info', 'stats', 'nav']);
                         setBlockPositions(user?.profilePositions || {});
                         setIsVisualEditMode(false);
                     }} className="w-full py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-bold transition-all">
                        Отменить
                     </button>
                  </div>
               </div>
            )}
            
            {!isVisualEditMode && !isEditing && (
               <button onClick={() => {
                  setIsVisualEditMode(true);
                  if (['settings', 'design', 'integrations'].includes(activeTab)) {
                     setActiveTab('favs');
                  }
               }} className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-all outline-none focus:ring-4 focus:ring-primary/50 relative group">
                  <Layout className="w-6 h-6" />
                  <span className="absolute right-full mr-4 bg-black/80 px-3 py-1.5 rounded-lg text-xs font-bold uppercase whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                     Свой макет
                  </span>
               </button>
            )}
         </div>
      )}
    </div>
  );
};

export default Profile;