'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Heart,
  Play,
  Trash2,
  Tv,
  Film,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { storage, STORAGE_CHANGE_EVENT, FavoriteItem, WatchProgress } from '@/lib/storage';
import { tmdb } from '@/lib/tmdb';
import { formatYear } from '@/lib/utils';

export default function FavoritesClient() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [progressList, setProgressList] = useState<WatchProgress[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'movie' | 'tv'>('all');

  useEffect(() => {
    function loadData() {
      setFavorites(storage.getFavorites());
      setProgressList(storage.getAllProgress());
    }

    loadData();
    storage.syncWithServer();

    window.addEventListener(STORAGE_CHANGE_EVENT, loadData);
    window.addEventListener('storage', loadData);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, loadData);
      window.removeEventListener('storage', loadData);
    };
  }, []);

  const handleRemove = (e: React.MouseEvent, item: FavoriteItem) => {
    e.preventDefault();
    e.stopPropagation();
    storage.toggleFavorite(item);
  };

  const filteredFavorites = favorites.filter((f) => {
    if (filterType === 'all') return true;
    return f.mediaType === filterType;
  });

  return (
    <div className="min-h-screen py-6 sm:py-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 sm:pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary shadow-glow-primary flex-shrink-0">
              <Heart className="w-4 h-4 sm:w-5 sm:h-5 fill-primary" />
            </div>
            <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
              Моё избранное
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Сохраненные фильмы и сериалы с отслеживанием просмотренных серий
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-surface p-1 sm:p-1.5 rounded-xl border border-white/5 text-xs overflow-x-auto scrollbar-none">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${
              filterType === 'all'
                ? 'bg-primary text-white shadow-glow-primary'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Все ({favorites.length})
          </button>
          <button
            onClick={() => setFilterType('movie')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${
              filterType === 'movie'
                ? 'bg-primary text-white shadow-glow-primary'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Фильмы ({favorites.filter((f) => f.mediaType === 'movie').length})
          </button>
          <button
            onClick={() => setFilterType('tv')}
            className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap flex-shrink-0 transition-colors ${
              filterType === 'tv'
                ? 'bg-primary text-white shadow-glow-primary'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Сериалы ({favorites.filter((f) => f.mediaType === 'tv').length})
          </button>
        </div>
      </div>

      {/* Content */}
      {filteredFavorites.length === 0 ? (
        <div className="py-24 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface border border-white/10 flex items-center justify-center mx-auto text-zinc-600">
            <Heart className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">В избранном пока пусто</h3>
            <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-sm mx-auto">
              Нажимайте на сердечко на карточке любого фильма или сериала, чтобы добавить его сюда и не потерять свой прогресс.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-glow-primary hover:bg-primary-hover transition-colors"
          >
            Перейти в каталог <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-8">
          {filteredFavorites.map((item) => {
            // Find progress for this item
            const progress =
              item.lastWatched ||
              progressList.find(
                (p) => p.mediaId === item.id && p.mediaType === item.mediaType
              );

            const posterUrl = tmdb.getImageUrl(item.poster_path, 'w500');
            const detailHref = `/${item.mediaType}/${item.id}`;

            // Link to continue watching if hash and streamUrl exist
            const watchUrl =
              progress?.hash && progress?.streamUrl
                ? `/watch?hash=${encodeURIComponent(progress.hash)}&index=${progress.fileIndex || 1}&title=${encodeURIComponent(
                    item.title + (progress.season && progress.episode ? ` S${progress.season}E${progress.episode}` : '')
                  )}&streamUrl=${encodeURIComponent(progress.streamUrl)}&poster=${encodeURIComponent(posterUrl)}&mediaId=${item.id}&mediaType=${item.mediaType}&season=${progress.season || ''}&episode=${progress.episode || ''}`
                : detailHref;

            return (
              <div
                key={`${item.mediaType}-${item.id}`}
                className="group relative flex flex-col rounded-2xl bg-cinema-card border border-white/5 hover:border-primary/40 hover:bg-surface-hover transition-all duration-300 overflow-hidden shadow-lg"
              >
                {/* Poster */}
                <div className="relative aspect-[16/10] w-full bg-surface overflow-hidden">
                  <img
                    src={posterUrl}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-cinema-card via-black/40 to-transparent" />

                  {/* Remove button */}
                  <button
                    onClick={(e) => handleRemove(e, item)}
                    className="absolute top-2.5 right-2.5 p-2 rounded-xl bg-black/60 hover:bg-red-500 text-white/80 hover:text-white backdrop-blur-md transition-colors shadow-md"
                    title="Удалить из избранного"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Media type tag */}
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider text-zinc-300 border border-white/10">
                    {item.mediaType === 'movie' ? 'Фильм' : 'Сериал'}
                  </div>

                  {/* Play overlay button */}
                  <Link
                    href={watchUrl}
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30"
                  >
                    <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center shadow-glow-primary transform scale-90 group-hover:scale-100 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </Link>
                </div>

                {/* Details */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h3 className="font-bold text-sm text-zinc-100 line-clamp-1 group-hover:text-primary transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {formatYear(item.release_date || item.first_air_date)}
                    </p>
                  </div>

                  {/* Progress Indicator Badge */}
                  {progress ? (
                    <div className="p-2.5 rounded-xl bg-surface border border-white/5 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-emerald-400 font-bold flex items-center gap-1 truncate">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          {item.mediaType === 'tv' && (progress.season || progress.episode) ? (
                            <span className="truncate">
                              {progress.season ? `${progress.season} сезон` : ''}
                              {progress.season && progress.episode ? ', ' : ''}
                              {progress.episode ? `${progress.episode} серия` : ''}
                            </span>
                          ) : (
                            <span>Просмотрено</span>
                          )}
                        </span>
                        {(progress.progressPercent ?? 0) > 0 && (
                          <span className="text-zinc-400 font-semibold flex-shrink-0">
                            {progress.progressPercent}%
                          </span>
                        )}
                      </div>

                      {progress.episodeTitle && (
                        <p className="text-[10px] text-zinc-400 truncate">
                          «{progress.episodeTitle}»
                        </p>
                      )}

                      {/* Progress bar */}
                      {(progress.progressPercent ?? 0) > 0 && (
                        <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(5, progress.progressPercent || 0)
                              )}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : item.mediaType === 'tv' ? (
                    <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <Tv className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Сериал еще не начат</span>
                    </div>
                  ) : null}

                  {/* Actions */}
                  <div className="pt-2 flex items-center gap-2">
                    <Link
                      href={watchUrl}
                      className="flex-1 py-2 px-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-glow-primary transition-colors"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      {progress ? 'Продолжить' : 'Смотреть'}
                    </Link>

                    <Link
                      href={detailHref}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-white/5 transition-colors"
                      title="Подробнее о фильме"
                    >
                      <Film className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
