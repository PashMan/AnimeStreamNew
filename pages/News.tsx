
import React, { useEffect, useState } from 'react';
import { Calendar, ChevronRight, Megaphone, Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchNews } from '../services/shikimori';
import { NewsItem } from '../types';
import SEO from '../components/SEO';
import { LazyRender } from '../components/LazyRender';

const News: React.FC = () => {
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadNews = async () => {
        setIsLoading(true);
        const data = await fetchNews();
        setNewsList(data);
        setIsLoading(false);
    }
    loadNews();
  }, []);

  if (isLoading) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 py-10 min-h-screen pt-28 space-y-12 bg-[#141519]">
      <SEO 
        title="Новости аниме" 
        description="Последние новости из мира аниме: анонсы, трейлеры, даты выхода и важные события индустрии."
      />
      
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-white/5">
        <div>
          <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight font-display flex items-center gap-3">
            <span className="w-2 h-10 bg-primary rounded-full inline-block animate-pulse" />
            Новости индустрии
          </h1>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1.5">
            Будьте в курсе последних анонсов, дат выхода, трейлеров и ключевых новостей из мира аниме
          </p>
        </div>
      </div>

      {newsList.length === 0 ? (
        <div className="text-center py-20 text-slate-500 text-xs font-bold uppercase tracking-widest">Новости не найдены</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {newsList.map((item, idx) => (
              <LazyRender key={item.id + idx} threshold={0.1}>
                <Link 
                  to={`/news/${item.id}`}
                  className="group flex flex-col p-6 bg-surface/30 rounded-2xl border border-white/5 hover:border-primary/40 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden backdrop-blur-md shadow-xl h-full justify-between"
                >
                   <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-3xl -mr-32 -mt-32 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                   
                   <div className="relative z-10 flex-grow flex flex-col justify-between">
                       <div>
                           <div className="flex items-center gap-3 mb-4">
                               <span className="px-2.5 py-0.5 bg-primary/10 border border-primary/20 rounded text-[9.5px] font-black text-primary uppercase tracking-wider">
                                   {item.category}
                               </span>
                               <span className="text-[9px] text-slate-500 font-extrabold uppercase tracking-wider flex items-center gap-1">
                                   <Calendar className="w-3 h-3" /> {item.date}
                               </span>
                           </div>

                           <h2 className="text-base md:text-lg font-black text-white mb-3 group-hover:text-primary transition-colors uppercase tracking-tight leading-tight line-clamp-2">
                               {item.title}
                           </h2>

                           <p className="text-slate-400 text-xs leading-relaxed mb-6 line-clamp-3 font-medium border-l-2 border-white/15 pl-3.5">
                               {item.summary?.replace(/<[^>]*>/g, '')}
                           </p>
                       </div>

                       <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-white transition-colors w-fit pt-4 border-t border-white/5 mt-4">
                          Читать материал <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                       </div>
                   </div>
                </Link>
              </LazyRender>
           ))}
        </div>
      )}
    </div>
  );
};

export default News;
