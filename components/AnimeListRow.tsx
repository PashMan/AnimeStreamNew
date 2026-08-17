import React from 'react';
import { Link } from 'react-router-dom';
import { Star, Tv, Clock } from 'lucide-react';
import { Anime } from '../types';
import { Image } from './Image';
import { useSlugBlocks } from '../store/slugBlocks';
import { useDmcaBlocks } from '../store/dmcaBlocks';

export const AnimeListRow: React.FC<{ anime: Anime }> = ({ anime }) => {
  const { slugBlocks } = useSlugBlocks();
  const { dmcaBlocks } = useDmcaBlocks();
  
  const isDmcaBlocked = dmcaBlocks.includes(anime.id.toString());
  const isSlugBlocked = slugBlocks.includes(anime.id.toString());
  const targetUrl = isDmcaBlocked ? `/anime/${anime.id}-watch` : `/anime/${anime.id}${anime.slug && !isSlugBlocked ? "-" + anime.slug : ''}`;

  return (
    <Link to={targetUrl} className="group flex gap-4 bg-surface-light border border-white/5 rounded-2xl p-3 hover:bg-white/5 transition-colors items-center overflow-hidden w-full text-left inline-flex">
        <div className="w-16 h-24 sm:w-20 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-surface relative">
            <Image src={anime.image} animeId={anime.id} animeTitle={anime.originalName || anime.title} alt={anime.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
            <h3 className="text-white font-bold text-sm sm:text-base line-clamp-1 mb-1 group-hover:text-primary transition-colors">{anime.title}</h3>
            {anime.originalName && <h4 className="text-slate-400 text-xs line-clamp-1 mb-2">{anime.originalName}</h4>}
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest mt-auto">
                <span className="flex items-center gap-1"><Tv className="w-3 h-3" /> {anime.type}</span>
                {(anime.episodesAired || 0) > 0 && <span className="flex items-center gap-1 text-slate-300"><Clock className="w-3 h-3 text-slate-500" /> {anime.episodesAired} эп.</span>}
                <span className="flex items-center gap-1 text-yellow-500"><Star className="w-3 h-3 fill-current" /> {anime.rating || 'N/A'}</span>
            </div>
        </div>
        <div className="hidden sm:flex flex-col items-end justify-center shrink-0 text-xs font-bold uppercase tracking-widest">
            <span className={`px-3 py-1 rounded-lg border ${anime.status === 'Ongoing' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                {anime.status}
            </span>
        </div>
    </Link>
  );
};
