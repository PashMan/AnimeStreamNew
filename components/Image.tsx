import React, { useState, useEffect, useRef, ImgHTMLAttributes } from 'react';
import { ImageOff } from 'lucide-react';
import { fetchAnimeImage } from '../services/animeImages';
import { FALLBACK_IMAGE } from '../constants';

interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallbackClassName?: string;
  priority?: boolean;
  animeId?: string;
  animeTitle?: string;
  onImageLoad?: () => void;
}

export const Image = ({ src, alt, className, fallbackClassName, priority, animeId, animeTitle, onImageLoad, ...props }: ImageProps) => {
  const [imageSrc, setImageSrc] = useState<string | undefined>(src);
  const [isLoading, setIsLoading] = useState(true);
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0: Initial, 1: Anilist, 2: Failed
  const [isInView, setIsInView] = useState(priority || false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
      if (priority) {
          setIsInView(true);
          return;
      }
      if (!imgRef.current) return;
      const observer = new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) {
              setIsInView(true);
              observer.disconnect();
          }
      }, { rootMargin: '400px' }); // Increased rootMargin
      observer.observe(imgRef.current);
      return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
      if (src !== imageSrc) {
          setImageSrc(src);
          setIsLoading(true);
          setFallbackLevel(0);
      }
  }, [src]);

  // If src is missing initially, start fallback chain immediately
  useEffect(() => {
      if ((!src || src === FALLBACK_IMAGE) && fallbackLevel === 0) {
          setFallbackLevel(1);
      }
  }, [src, fallbackLevel, animeTitle]);

  useEffect(() => {
      if (fallbackLevel === 1 && animeTitle && isInView) {
          let active = true;
          fetchAnimeImage(animeTitle).then(url => {
              if (active) {
                  if (url) {
                      setImageSrc(url);
                  } else {
                      setFallbackLevel(2); // Give up
                  }
              }
          }).catch((err) => {
              active && setFallbackLevel(2);
          });
          return () => { active = false; };
      }
  }, [fallbackLevel, animeTitle, isInView]);

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

  if (fallbackLevel === 2 || (!imageSrc && fallbackLevel === 0 && !animeId)) {
    return (
      <div className={`flex items-center justify-center bg-white/5 text-slate-500 overflow-hidden ${className} ${fallbackClassName || ''}`}>
        <img src={FALLBACK_IMAGE} alt="" className="w-full h-full object-cover opacity-50 grayscale" />
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
      loading={priority ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      // @ts-ignore
      fetchpriority={priority ? "high" : "auto"}
      decoding={priority ? "sync" : "async"}
      {...props}
    />
  );
};
