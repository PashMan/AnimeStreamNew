import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Loader2, ChevronLeft, Users, Calendar, Info, Trash2 } from 'lucide-react';
import AnimeCard from '../components/AnimeCard';
import { db } from '../services/db';
import { fetchAnimeDetails } from '../services/shikimori';
import { CommunityCollection, Anime } from '../types';
import SEO from '../components/SEO';
import { useAuth } from '../context/AuthContext';

const CommunityCollectionDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collection, setCollection] = useState<CommunityCollection | null>(null);
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const data = await db.getCommunityCollection(id);
        if (data) {
          setCollection(data);
          // Fetch full anime details for each item
          if (data.items) {
            const animePromises = data.items.map((item: any) => fetchAnimeDetails(item.animeId));
            const resolvedAnime = await Promise.all(animePromises);
            setAnimeList(resolvedAnime.filter((a): a is Anime => a !== null));
          }
        }
      } catch (error) {
        console.error('Error loading community collection:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id]);

  const handleDelete = async () => {
    if (!collection || !window.confirm('Вы уверены, что хотите удалить эту подборку?')) return;
    setIsDeleting(true);
    const success = await db.deleteCommunityCollection(collection.id);
    if (success) {
      navigate('/');
    } else {
      alert('Ошибка при удалении подборки');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Подборка не найдена</h2>
          <Link to="/" className="text-primary hover:underline">Вернуться на главную</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark pt-24 pb-20 animate-in fade-in duration-700">
      <SEO 
        title={`${collection.name} - Подборка от сообщества`} 
        description={collection.description || `Смотреть подборку ${collection.name} онлайн.`}
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition-colors text-sm font-bold uppercase tracking-widest">
          <ChevronLeft className="w-4 h-4" /> На главную
        </Link>

        <div className="bg-surface/30 border border-white/5 rounded-[3rem] p-10 mb-12 shadow-2xl backdrop-blur-md relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="bg-primary/20 text-primary px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 border border-primary/20">
              Community Collection
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-6 font-display">
              {collection.name}
            </h1>
            <p className="text-slate-400 max-w-2xl text-lg leading-relaxed mb-8">
              {collection.description || 'Автор не оставил описания к этой подборке.'}
            </p>
            
            <div className="flex flex-wrap items-center justify-center gap-6">
              <div className="flex items-center gap-2 text-slate-500">
                <Users className="w-4 h-4" />
                <Link 
                  to={`/profile/${collection.creator?.email}`}
                  className="text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"
                >
                  от {collection.creator?.name}
                </Link>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <Calendar className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">создана {new Date(collection.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <Info className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">{animeList.length} аниме</span>
              </div>
              {user?.role === 'admin' && (
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors bg-red-500/10 px-3 py-1.5 rounded-xl border border-red-500/20"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  <span className="text-xs font-bold uppercase tracking-widest">Удалить</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Results Grid */}
        {animeList.length === 0 ? (
          <div className="bg-surface/30 rounded-[2.5rem] p-20 text-center border border-white/5">
            <h3 className="text-xl font-black text-white uppercase mb-2">В подборке пока нет аниме</h3>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-10">
            {animeList.map((anime, idx) => <AnimeCard key={`${anime.id}-${idx}`} anime={anime} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityCollectionDetail;
