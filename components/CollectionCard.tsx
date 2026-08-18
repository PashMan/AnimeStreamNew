import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchAnimes, GENRE_MAP } from '../services/shikimori';

interface CollectionCardProps {
  collection: {
    id: string;
    title: string;
    color: string;
    count: string;
    defaultGenre?: string;
    image: string;
  };
}

const CollectionCard: React.FC<CollectionCardProps> = ({ collection }) => {
  const [coverImage, setCoverImage] = useState<string>(collection.image);

  useEffect(() => {
    let isMounted = true;
    
    const fetchCover = async () => {
      if (!collection.defaultGenre) return;
      
      try {
        const genreId = GENRE_MAP[collection.defaultGenre];
        if (!genreId) return;
        
        const results = await fetchAnimes({
          limit: 9,
          order: 'popularity',
          genre: genreId
        });
        
        if (isMounted && results.length >= 9) {
          setCoverImage(results[8].image);
        } else if (isMounted && results.length > 0) {
          // Fallback to the last available if less than 9
          setCoverImage(results[results.length - 1].image);
        }
      } catch (error) {
        console.error('Failed to fetch cover for collection:', collection.id);
      }
    };

    fetchCover();

    return () => {
      isMounted = false;
    };
  }, [collection.id, collection.defaultGenre]);

  return (
    <Link to={`/collections/${collection.id}`} className="group relative h-56 rounded-2xl overflow-hidden block shadow-xl border border-white/5 bg-[#0a0a0f] animate-in fade-in zoom-in duration-500">
      <img src={coverImage} alt={collection.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" referrerPolicy="no-referrer" />
      
      {/* Cinematic gradient overlay directly on the cover, matching Netflix collection style */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/35 opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
      <div className="absolute inset-0 bg-black/25 mix-blend-multiply" />

      <div className="absolute inset-0 p-5 flex flex-col justify-end z-10">
        <div className="bg-primary/20 backdrop-blur-md px-2.5 py-1 rounded text-primary text-[9px] font-black w-fit mb-2 border border-primary/25 tracking-wider uppercase">
          {collection.count}
        </div>
        <h3 className="text-white font-extrabold text-lg leading-tight tracking-tight drop-shadow-md group-hover:text-primary transition-colors duration-300">{collection.title}</h3>
      </div>
    </Link>
  );
};

export default CollectionCard;
