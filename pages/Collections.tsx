import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import SEO from '../components/SEO';
import { Image } from '../components/Image';
import { COLLECTIONS_DATA } from '../constants';
import CollectionCard from '../components/CollectionCard';

// List of collections known to be empty or problematic to hide from the main list
const HIDDEN_COLLECTIONS = [
  'isekai', 'magic', 'urban-fantasy', 'villainess', 
  'cgdct', 'anthropomorphism'
];

const Collections: React.FC = () => {
  const [visibleCount, setVisibleCount] = useState(12);
  
  // Filter out hidden collections
  const validCollections = COLLECTIONS_DATA.filter(c => !HIDDEN_COLLECTIONS.includes(c.id));
  
  const collectionsWithImages = validCollections.slice(0, visibleCount);
  const hasMore = visibleCount < validCollections.length;

  const loadMore = () => {
    setVisibleCount(prev => Math.min(prev + 12, validCollections.length));
  };

  return (
    <div className="min-h-screen bg-[#141519] pt-28 pb-20 animate-in fade-in duration-700">
      <SEO 
        title="Подборки аниме" 
        description="Лучшие подборки аниме по жанрам, темам и настроению. Найдите что посмотреть на вечер."
      />
      
      <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-6 border-b border-white/5 mb-10">
          <div>
            <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight font-display flex items-center gap-3">
              <span className="w-2 h-10 bg-primary rounded-full inline-block animate-pulse" />
              Коллекции и Подборки
            </h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1.5">
              Специально собранные коллекции и тематические списки аниме на любой вкус
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {collectionsWithImages.map(collection => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>

        {hasMore && (
          <div className="flex justify-center mt-16">
            <button 
              onClick={loadMore}
              className="px-10 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg"
            >
              Показать больше коллекций
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Collections;
