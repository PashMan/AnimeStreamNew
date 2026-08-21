import React, { useState, useEffect, useRef, ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchAnimeImage } from '../services/animeImages';
import { FALLBACK_IMAGE } from '../constants';
import { isTvDevice } from '../utils/tvDetection';

interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallbackClassName?: string;
  priority?: boolean;
  animeId?: string;
  animeTitle?: string;
  onImageLoad?: () => void;
}

export const Image = ({ src, alt, className, fallbackClassName, priority, animeId, animeTitle, onImageLoad, ...props }: ImageProps) => {
  const isTv = isTvDevice();
  const [imageSrc, setImageSrc] = useState<string | undefined>(src);
  const [isLoading, setIsLoading] = useState(true);
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0: Initial, 1: Anilist, 2: Failed
  const [isInView, setIsInView] = useState(priority || isTv || false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
      if (priority || isTv) {
          setIsInView(true);
          return;
      }
      if (!imgRef.current) return;
      const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
              setIsInView(true);
              observer.disconnect();
          }
      }, { rootMargin: '600px' });
      observer.observe(imgRef.current);
      return () => observer.disconnect();
  }, [priority, isTv]);

  useEffect(() => {
      if (src !== imageSrc) {
          setImageSrc(src);
          setIsLoading(true);
          setFallbackLevel(0);
      }
  }, [src]);

  // Check if image is already loaded (from cache)
  useEffect(() => {
      if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
          setIsLoading(false);
      }
  }, [imageSrc]);

  // If src is missing or placeholder initially, start fallback chain immediately
  useEffect(() => {
      if ((!src || src === FALLBACK_IMAGE || src.includes('missing') || src.includes('none.png')) && fallbackLevel === 0) {
          setFallbackLevel(1);
      }
  }, [src, fallbackLevel, animeTitle, animeId]);

  useEffect(() => {
      if (fallbackLevel === 1 && (animeTitle || animeId) && isInView) {
          let active = true;
          fetchAnimeImage(animeTitle || '', animeId).then(url => {
              if (active) {
                  if (url) {
                      setImageSrc(url);
                  } else {
                      setFallbackLevel(2); // Give up
                  }
              }
          }).catch(() => {
              active && setFallbackLevel(2);
          });
          return () => { active = false; };
      }
  }, [fallbackLevel, animeTitle, animeId, isInView]);

  const handleError = () => {
      setIsLoading(false);
      if (fallbackLevel < 2) {
          setFallbackLevel(prev => prev + 1);
      }
  };

  const handleLoad = () => {
      setIsLoading(false);
      if (onImageLoad) onImageLoad();
  };

  if (fallbackLevel === 2 || (!imageSrc && fallbackLevel === 0 && !animeId && !animeTitle)) {
    return (
      <div className={`flex items-center justify-center bg-slate-900/80 text-slate-500 overflow-hidden border border-white/5 ${className} ${fallbackClassName || ''}`}>
        <div className="flex flex-col items-center justify-center p-3 text-center">
          <ImageOff className="w-6 h-6 text-slate-600 mb-1 opacity-70" />
          <span className="text-[10px] text-slate-500 font-medium tracking-tight line-clamp-1">{alt || 'Нет изображения'}</span>
        </div>
      </div>
    );
  }

  return (
    <img
      ref={imgRef}
      src={imageSrc || FALLBACK_IMAGE}
      alt={alt}
      className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
      onError={handleError}
      onLoad={handleLoad}
      loading={priority || isTv ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      // @ts-ignore
      fetchpriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
      {...props}
    />
  );
};
