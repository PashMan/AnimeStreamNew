import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface LazySectionProps {
  children: (data: any) => React.ReactNode;
  fetchData: () => Promise<any>;
  className?: string;
  placeholder?: React.ReactNode;
}

export const LazySection: React.FC<LazySectionProps> = ({ children, fetchData, className, placeholder }) => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.01, rootMargin: '800px' }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isVisible && !data && !isLoading) {
      setIsLoading(true);
      fetchData().then(result => {
        setData(result);
        setIsLoading(false);
      });
    }
  }, [isVisible, data, isLoading, fetchData]);

  return (
    <div ref={ref} className={className}>
      {data ? (
        children(data)
      ) : (
        placeholder || (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )
      )}
    </div>
  );
};
