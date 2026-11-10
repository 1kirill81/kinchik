'use client';

import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import { storage, STORAGE_CHANGE_EVENT, FavoriteItem } from '@/lib/storage';

interface FavoriteButtonProps {
  item: {
    id: number;
    mediaType: 'movie' | 'tv';
    title: string;
    poster_path: string | null;
    backdrop_path: string | null;
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
  };
  showLabel?: boolean;
  className?: string;
}

export default function FavoriteButton({
  item,
  showLabel = false,
  className = '',
}: FavoriteButtonProps) {
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    setIsFav(storage.isFavorite(item.id, item.mediaType));

    const handleSync = () => {
      setIsFav(storage.isFavorite(item.id, item.mediaType));
    };

    window.addEventListener(STORAGE_CHANGE_EVENT, handleSync);
    window.addEventListener('storage', handleSync);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, [item.id, item.mediaType]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const added = storage.toggleFavorite({
      id: item.id,
      mediaType: item.mediaType,
      title: item.title,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      vote_average: item.vote_average,
      release_date: item.release_date,
      first_air_date: item.first_air_date,
    });

    setIsFav(added);
  };

  return (
    <button
      onClick={handleToggle}
      className={`inline-flex items-center gap-2 rounded-xl transition-all duration-200 active:scale-90 ${
        isFav
          ? 'text-primary bg-primary/10 border border-primary/30'
          : 'text-zinc-400 hover:text-white bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10'
      } ${showLabel ? 'px-4 py-3 text-sm font-semibold' : 'p-2.5'} ${className}`}
      title={isFav ? 'Удалить из избранного' : 'Добавить в избранное'}
      aria-label={isFav ? 'Удалить из избранного' : 'Добавить в избранное'}
    >
      <Heart
        className={`w-5 h-5 transition-transform duration-200 ${
          isFav ? 'fill-primary text-primary scale-110' : ''
        }`}
      />
      {showLabel && <span>{isFav ? 'В избранном' : 'В избранное'}</span>}
    </button>
  );
}
