
import React, { useState, useEffect, useRef } from 'react';

interface LazyRenderProps {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
  rootMargin?: string;
  onVisible?: () => void;
}

export const LazyRender: React.FC<LazyRenderProps> = ({ 
  children, 
  className, 
  threshold = 0.01, 
  rootMargin = '800px',
  onVisible 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (onVisible) onVisible();
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin, onVisible]);

  return (
    <div ref={ref} className={className}>
      {isVisible ? children : <div className="min-h-[100px]" />}
    </div>
  );
};

export default LazyRender;
