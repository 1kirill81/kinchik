'use client';

import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '@/types/tmdb';
import MediaCard from './MediaCard';

interface MediaCarouselProps {
  title: string;
  items: MediaItem[];
  icon?: React.ReactNode;
}

export default function MediaCarousel({ title, items, icon }: MediaCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = clientWidth * 0.75;
      scrollRef.current.scrollTo({
        left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="relative my-6 sm:my-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {icon && <span className="text-primary flex-shrink-0">{icon}</span>}
          <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight truncate">{title}</h2>
        </div>

        {/* Navigation Arrows (touch-scrollable directly on phones) */}
        <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => scroll('left')}
            className="p-2 rounded-xl bg-surface border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Прокрутить назад"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-2 rounded-xl bg-surface border border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Прокрутить вперед"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-3 sm:gap-4 overflow-x-auto scrollbar-none py-1.5 sm:py-2 -mx-4 px-4 sm:mx-0 sm:px-1 scroll-smooth"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {items.map((item) => (
          <MediaCard key={`${item.media_type || 'item'}-${item.id}`} item={item} />
        ))}
      </div>
    </section>
  );
}
