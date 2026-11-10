'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Info, Star } from 'lucide-react';
import { MediaItem } from '@/types/tmdb';
import { tmdb } from '@/lib/tmdb';
import { formatYear } from '@/lib/utils';
import FavoriteButton from './FavoriteButton';

interface HeroBannerProps {
  item: MediaItem;
}

export default function HeroBanner({ item }: HeroBannerProps) {
  if (!item) return null;

  const title = item.title || item.name || '';
  const year = formatYear(item.release_date || item.first_air_date);
  const mediaType = item.media_type || (item.title ? 'movie' : 'tv');
  const backdropUrl = tmdb.getImageUrl(item.backdrop_path || item.poster_path, 'original');
  const detailHref = `/${mediaType}/${item.id}`;

  return (
    <div className="relative w-full h-[70vh] min-h-[500px] max-h-[750px] overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <img
          src={backdropUrl}
          alt={title}
          className="w-full h-full object-cover object-top filter brightness-75 scale-105 animate-pulse-subtle"
        />
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-transparent w-full md:w-3/4" />
      </div>

      {/* Content */}
      <div className="relative max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16 z-10">
        <div className="max-w-2xl space-y-4">
          {/* Badges */}
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-lg bg-primary/90 text-white text-xs font-bold uppercase tracking-wider shadow-glow-primary">
              В тренде
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white/10 backdrop-blur-md text-zinc-300 text-xs font-medium uppercase">
              {mediaType === 'movie' ? 'Фильм' : 'Сериал'}
            </span>
            {item.vote_average > 0 && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-amber-400 text-xs font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                {item.vote_average.toFixed(1)}
              </span>
            )}
            <span className="text-zinc-400 text-sm font-medium">{year}</span>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-tight">
            {title}
          </h1>

          {/* Overview */}
          <p className="text-sm sm:text-base text-zinc-300 line-clamp-3 leading-relaxed max-w-xl">
            {item.overview || 'Описание отсутствует.'}
          </p>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href={detailHref}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-glow-primary transition-all transform hover:scale-105 active:scale-95"
            >
              <Play className="w-5 h-5 fill-white" />
              Смотреть онлайн
            </Link>

            <Link
              href={detailHref}
              className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm backdrop-blur-md border border-white/10 transition-colors"
            >
              <Info className="w-5 h-5 text-zinc-300" />
              Подробнее
            </Link>

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
              showLabel={true}
              className="px-5 py-3.5"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
