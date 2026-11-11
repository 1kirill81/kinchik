'use client';

import React from 'react';
import Link from 'next/link';
import { Star, Play } from 'lucide-react';
import { MediaItem } from '@/types/tmdb';
import { tmdb } from '@/lib/tmdb';
import { formatYear } from '@/lib/utils';
import FavoriteButton from './FavoriteButton';

interface MediaCardProps {
  item: MediaItem;
}

export default function MediaCard({ item }: MediaCardProps) {
  const title = item.title || item.name || 'Без названия';
  const year = formatYear(item.release_date || item.first_air_date);
  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
  const href = `/${mediaType}/${item.id}`;
  const posterUrl = tmdb.getImageUrl(item.poster_path, 'w500');

  return (
    <Link href={href} className="group relative flex flex-col flex-shrink-0 w-36 sm:w-44 md:w-48 transition-transform duration-300">
      <div className="relative aspect-[2/3] w-full rounded-xl sm:rounded-2xl overflow-hidden bg-surface border border-white/10 shadow-lg group-hover:border-primary/50 group-hover:shadow-glow-primary transition-all duration-300">
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Hover overlay with Play button */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-lg transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play className="w-5 h-5 fill-white ml-0.5" />
          </div>
        </div>

        {/* Rating Badge */}
        {item.vote_average > 0 && (
          <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 px-1.5 sm:px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 flex items-center gap-1 text-[10px] sm:text-xs font-bold text-amber-400">
            <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-400" />
            <span>{item.vote_average.toFixed(1)}</span>
          </div>
        )}

        {/* Type Badge */}
        <div className="absolute top-2 left-2 sm:top-2.5 sm:left-2.5 px-1.5 sm:px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
          {mediaType === 'movie' ? 'Фильм' : 'Сериал'}
        </div>

        {/* Favorite Button on Card */}
        <div className="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 z-20">
          <FavoriteButton
            item={{
              id: item.id,
              mediaType,
              title,
              poster_path: item.poster_path,
              backdrop_path: item.backdrop_path,
              vote_average: item.vote_average,
              release_date: item.release_date,
              first_air_date: item.first_air_date,
            }}
          />
        </div>
      </div>

      {/* Info below */}
      <div className="mt-2.5 px-0.5">
        <h3 className="text-sm font-semibold text-zinc-100 truncate group-hover:text-primary transition-colors">
          {title}
        </h3>
        <p className="text-xs text-zinc-400 mt-0.5">{year || '—'}</p>
      </div>
    </Link>
  );
}
