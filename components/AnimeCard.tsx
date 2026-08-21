import React from 'react';
import { Link } from 'react-router-dom';
import { Star, PlayCircle, Crown } from 'lucide-react';
import { Anime } from '../types';
import { Image } from './Image';
import { useSlugBlocks } from '../store/slugBlocks';
import { useDmcaBlocks } from '../store/dmcaBlocks';

interface AnimeCardProps {
  anime: Anime;
  rank?: number;
}

const AnimeCard: React.FC<AnimeCardProps> = ({ anime, rank }) => {
  const totalEps = Number(anime.episodes) || 0;
  const airedEps = Number(anime.episodesAired) || 0;
  const isReleased = anime.status === 'released' || anime.status === 'finished' || anime.status === 'Completed';

  let formattedEpisodes = '';
  if (isReleased) {
    const count = totalEps || airedEps || 12;
    formattedEpisodes = `${count} эп.`;
  } else if (airedEps > 0 && totalEps > 0) {
    if (airedEps >= totalEps) {
      formattedEpisodes = `${totalEps} эп.`;
    } else {
      formattedEpisodes = `${airedEps} / ${totalEps} эп.`;
    }
  } else if (totalEps > 0) {
    formattedEpisodes = `${totalEps} эп.`;
  } else if (airedEps > 0) {
    formattedEpisodes = `${airedEps} эп.`;
  } else {
    formattedEpisodes = '12+ эп.';
  }

  const { slugBlocks } = useSlugBlocks();
  const { dmcaBlocks } = useDmcaBlocks();
  const isSlugBlocked = slugBlocks.includes(anime.id);
  const isDmcaBlocked = dmcaBlocks.includes(anime.id);
  const isWatchedLocal = localStorage.getItem(`anime_watched_${anime.id}`) !== null;

  const targetUrl = isDmcaBlocked 
    ? `/anime/${anime.id}-watch` 
    : `/anime/${anime.id}${anime.slug && !isSlugBlocked ? `-${anime.slug}` : ''}`;

  const ratingNum = typeof anime.rating === 'number' ? anime.rating : parseFloat((anime.rating as any) || '0');
  let ratingColorClass = "text-white/90 bg-neutral-900/80 border-white/10";
  if (ratingNum >= 7.4) {
    ratingColorClass = "text-emerald-400 bg-emerald-950/70 border-emerald-500/20";
  } else if (ratingNum > 0 && ratingNum < 6.0) {
    ratingColorClass = "text-rose-400 bg-rose-950/70 border-rose-500/20";
  } else if (ratingNum >= 6.0) {
    ratingColorClass = "text-amber-400 bg-amber-950/70 border-amber-500/20";
  }

  return (
    <Link to={targetUrl} className="group block relative w-full h-full">
      <div className="relative w-full aspect-[2/3] rounded-xl overflow-hidden mb-2.5 bg-neutral-900/40 border border-white/5 group-hover:border-primary/50 transition-all duration-500 ease-out shadow-lg group-hover:shadow-[0_12px_24px_rgba(139,92,246,0.15)] group-hover:-translate-y-1">
        <Image 
          src={anime.image} 
          alt={`Смотреть аниме ${anime.title} онлайн`} 
          animeId={anime.id}
          animeTitle={anime.originalName || anime.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 will-change-transform" 
        />
        
        {/* Soft immersive dark vignette around edges */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141519] via-transparent to-[#141519]/30 opacity-70 group-hover:opacity-90 transition-opacity duration-300" />
        
        {/* Top Badges Row */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-20 pointer-events-none">
          {rank ? (
            <div className="px-2 py-0.5 bg-primary text-[9px] font-black uppercase tracking-wider rounded shadow-md text-white">
              ТОП {rank}
            </div>
          ) : (
            <div className="flex gap-1.5 items-center">
              <div className="px-2 py-0.5 bg-[#141519]/60 backdrop-blur-md text-[8px] font-extrabold uppercase text-slate-400 tracking-wider rounded border border-white/5">
                {anime.type || 'TV'}
              </div>
            </div>
          )}

          {ratingNum > 0 && (
            <div className={`px-2 py-0.5 backdrop-blur-md rounded flex items-center gap-0.5 border shadow-md ${ratingColorClass}`}>
              <Star className="w-2.5 h-2.5 fill-current shrink-0 text-amber-500" />
              <span className="text-[9px] font-black tracking-tight">{ratingNum.toFixed(1)}</span>
            </div>
          )}
        </div>

        {/* Play Icon and Info overlay on hover */}
        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-10">
          <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center scale-75 group-hover:scale-100 transition-all duration-300 shadow-[0_0_15px_rgba(139,92,246,0.6)]">
            <PlayCircle className="w-6 h-6 fill-current ml-0.5 shrink-0" />
          </div>
        </div>

        {/* Crunchyroll Orange Watch Progress Line */}
        {isWatchedLocal && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#141519]/80 z-20">
            <div className="h-full w-full bg-primary" />
          </div>
        )}
      </div>
      
      <div className="px-0.5 text-left space-y-0.5">
        <h3 className="font-bold text-[13px] text-slate-200 group-hover:text-primary transition-colors line-clamp-1 truncate leading-tight" title={anime.title}>
          {anime.title}
        </h3>
        <div className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-tight text-slate-500">
          <span className="text-primary font-black shrink-0">{formattedEpisodes}</span>
          <span className="w-0.5 h-0.5 rounded-full bg-slate-700 shrink-0" />
          <span className="text-[7.5px] px-1 py-0.5 bg-white/5 border border-white/5 rounded text-slate-400 font-black leading-none uppercase tracking-widest shrink-0">Суб</span>
          <span className="text-[7.5px] px-1 py-0.5 bg-white/5 border border-white/5 rounded text-slate-400 font-black leading-none uppercase tracking-widest shrink-0">Дуб</span>
          <span className="w-0.5 h-0.5 rounded-full bg-slate-700 shrink-0" />
          <span className="shrink-0">{anime.year || '2024'}</span>
        </div>
      </div>
    </Link>
  );
};

export default AnimeCard;
