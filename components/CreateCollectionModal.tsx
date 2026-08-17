import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Loader2, Trash2 } from 'lucide-react';
import { Anime } from '../types';
import { fetchAnimes } from '../services/shikimori';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';

interface CreateCollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateCollectionModal: React.FC<CreateCollectionModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const [selectedAnime, setSelectedAnime] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        handleSearch(searchQuery);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await fetchAnimes({ search: query, limit: 10 });
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchError('Ошибка поиска. Попробуйте позже.');
    } finally {
      setIsSearching(false);
    }
  };

  const addAnime = (anime: Anime) => {
    if (!anime.id || !anime.title || !anime.image) {
      console.warn('Invalid anime data:', anime);
      return;
    }
    if (!selectedAnime.find(a => a.id === anime.id)) {
      setSelectedAnime([...selectedAnime, anime]);
    }
  };

  const removeAnime = (animeId: string) => {
    setSelectedAnime(selectedAnime.filter(a => a.id !== animeId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !name.trim() || selectedAnime.length === 0) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let finalCoverImage = coverImage.trim() || undefined;

      if (coverFile) {
        const uploadedUrl = await db.uploadCollectionCover(coverFile);
        if (uploadedUrl) {
          finalCoverImage = uploadedUrl;
        } else {
          setSubmitError("Не удалось загрузить обложку. Попробуйте использовать URL.");
          setIsSubmitting(false);
          return;
        }
      }

      const success = await db.createCommunityCollection(
        {
          name: name.trim(),
          description: description.trim(),
          creatorId: user.id,
          isPublic: true,
          coverImage: finalCoverImage
        },
        selectedAnime.map(a => ({
          animeId: a.id.toString(),
          animeTitle: a.title,
          animeImage: a.image
        }))
      );
      if (success) {
        onSuccess();
        onClose();
        // Reset form
        setName('');
        setDescription('');
        setCoverImage('');
        setCoverFile(null);
        setSelectedAnime([]);
      } else {
        setSubmitError("Произошла ошибка при создании подборки. Попробуйте позже.");
      }
    } catch (error: any) {
      console.error('Error creating collection:', error);
      setSubmitError(error.message || "Произошла непредвиденная ошибка.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-surface border border-white/10 rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Создать подборку</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Название подборки</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Лучшие исекаи 2024"
              className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-primary outline-none transition-colors"
            />
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Описание (необязательно)</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Расскажите о вашей подборке..."
              rows={3}
              className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-primary outline-none transition-colors resize-none"
            />
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Обложка (URL или файл, необязательно)</label>
            <div className="flex flex-col gap-4">
              <input 
                type="url" 
                value={coverImage}
                onChange={(e) => {
                  setCoverImage(e.target.value);
                  setCoverFile(null); // Clear file if URL is entered
                }}
                placeholder="https://example.com/image.jpg"
                className="w-full bg-black/20 border border-white/10 rounded-2xl px-6 py-4 text-white focus:border-primary outline-none transition-colors"
              />
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400">или</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCoverFile(file);
                      setCoverImage(''); // Clear URL if file is selected
                    }
                  }}
                  className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 transition-colors"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500">Если оставить пустым, будет использована обложка первого аниме в подборке.</p>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Добавить аниме ({selectedAnime.length})</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Поиск аниме..."
                  className="w-full bg-black/20 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:border-primary outline-none transition-colors"
                />
              </div>
              {isSearching && (
                <div className="flex items-center px-4">
                  <Loader2 className="animate-spin w-4 h-4 text-primary" />
                </div>
              )}
            </div>

            {searchError && (
              <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-4">
                {searchError}
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-black/20 rounded-2xl border border-white/5">
                {searchResults.map(anime => (
                  <button 
                    key={anime.id}
                    onClick={() => addAnime(anime)}
                    className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors text-left group"
                  >
                    <img src={anime.image} alt={anime.title} className="w-10 h-14 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate group-hover:text-primary transition-colors">{anime.title}</div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{anime.year}</div>
                    </div>
                    <Plus className="w-4 h-4 text-slate-600 group-hover:text-primary" />
                  </button>
                ))}
              </div>
            )}

            {selectedAnime.length > 0 && (
              <div className="space-y-3">
                <div className="text-[9px] font-black text-primary uppercase tracking-widest">Выбранные аниме:</div>
                <div className="flex flex-wrap gap-3">
                  {selectedAnime.map(anime => (
                    <div key={anime.id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl pl-2 pr-3 py-2">
                      <img src={anime.image} alt={anime.title} className="w-6 h-8 rounded object-cover" />
                      <span className="text-[10px] font-bold text-white max-w-[120px] truncate">{anime.title}</span>
                      <button onClick={() => removeAnime(anime.id.toString())} className="p-1 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-8 bg-black/20 border-t border-white/5">
          {submitError && (
            <div className="mb-4 text-red-500 text-sm font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">
              {submitError}
            </div>
          )}
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || selectedAnime.length === 0}
            className="w-full py-4 bg-primary text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-violet-600 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : 'Создать подборку'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateCollectionModal;
