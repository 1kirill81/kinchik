'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Play,
  Star,
  Clock,
  Calendar,
  Layers,
  Users,
  Film,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { MediaDetails } from '@/types/tmdb';
import { tmdb } from '@/lib/tmdb';
import { formatRuntime, formatYear } from '@/lib/utils';
import { storage, WatchProgress, STORAGE_CHANGE_EVENT } from '@/lib/storage';
import TorrentModal from '@/components/TorrentModal';
import MediaCarousel from '@/components/MediaCarousel';
import FavoriteButton from '@/components/FavoriteButton';

interface MovieDetailClientProps {
  movie: MediaDetails;
}

export default function MovieDetailClient({ movie }: MovieDetailClientProps) {
  const [isTorrentModalOpen, setIsTorrentModalOpen] = useState(false);
  const [savedProgress, setSavedProgress] = useState<WatchProgress | null>(null);

  const title = movie.title || movie.original_title || '';
  const year = formatYear(movie.release_date);
  const backdropUrl = tmdb.getImageUrl(movie.backdrop_path || movie.poster_path, 'original');
  const posterUrl = tmdb.getImageUrl(movie.poster_path, 'w500');

  useEffect(() => {
    function loadProgress() {
      setSavedProgress(storage.getProgressByMediaId(movie.id, 'movie'));
    }
    loadProgress();
    window.addEventListener(STORAGE_CHANGE_EVENT, loadProgress);
    window.addEventListener('storage', loadProgress);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, loadProgress);
      window.removeEventListener('storage', loadProgress);
    };
  }, [movie.id]);

  const cast = movie.credits?.cast?.slice(0, 8) || [];
  const recommendations = movie.recommendations?.results || movie.similar?.results || [];

  return (
    <div className="min-h-screen pb-16 sm:pb-20">
      {/* Backdrop Header */}
      <div className="relative w-full h-[36vh] min-h-[240px] sm:h-[52vh] sm:min-h-[380px] overflow-hidden">
        <img
          src={backdropUrl}
          alt={title}
          className="w-full h-full object-cover filter brightness-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent" />
      </div>

      {/* Main Details Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 sm:-mt-40 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-center md:items-start">
          {/* Movie Poster & Action CTA */}
          <div className="w-full max-w-[240px] sm:max-w-[256px] md:w-64 flex-shrink-0">
            <div className="aspect-[2/3] w-44 sm:w-full mx-auto rounded-2xl overflow-hidden bg-surface border border-white/10 shadow-2xl">
              <img src={posterUrl} alt={title} className="w-full h-full object-cover" />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 mt-4">
              <button
                onClick={() => setIsTorrentModalOpen(true)}
                className="w-full py-3 sm:py-3.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-glow-primary transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
                Найти раздачи и смотреть
              </button>

              <FavoriteButton
                item={{
                  id: movie.id,
                  mediaType: 'movie',
                  title,
                  poster_path: movie.poster_path,
                  backdrop_path: movie.backdrop_path,
                  vote_average: movie.vote_average,
                  release_date: movie.release_date,
                }}
                showLabel={true}
                className="w-full justify-center"
              />
            </div>
          </div>

          {/* Details Column */}
          <div className="flex-1 w-full min-w-0 space-y-4 sm:space-y-5 text-zinc-300">
            {/* Continue Watching Banner */}
            {savedProgress && savedProgress.progressPercent > 0 && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-primary/20 via-surface to-surface border border-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg animate-fade-in">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 shadow-glow-primary">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Вы остановились на
                    </span>
                    <h4 className="text-sm font-bold text-white mt-0.5">
                      Просмотрено {savedProgress.progressPercent}%
                    </h4>
                  </div>
                </div>

                {savedProgress.hash && savedProgress.streamUrl && (
                  <Link
                    href={`/watch?hash=${encodeURIComponent(savedProgress.hash)}&index=${savedProgress.fileIndex}&title=${encodeURIComponent(
                      title
                    )}&streamUrl=${encodeURIComponent(savedProgress.streamUrl)}&poster=${encodeURIComponent(posterUrl)}&mediaId=${movie.id}&mediaType=movie`}
                    className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center justify-center gap-2 shadow-glow-primary transition-all flex-shrink-0"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    Продолжить просмотр
                  </Link>
                )}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-xs font-semibold uppercase text-zinc-300">
                  Фильм
                </span>
                {year && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    {year}
                  </span>
                )}
                {movie.runtime && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Clock className="w-3.5 h-3.5 text-zinc-500" />
                    {formatRuntime(movie.runtime)}
                  </span>
                )}
                {movie.vote_average > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 text-amber-400 font-bold text-xs">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {movie.vote_average.toFixed(1)} / 10
                  </span>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mt-2">
                {title}
              </h1>

              {movie.original_title && movie.original_title !== title && (
                <p className="text-sm text-zinc-400 mt-1">{movie.original_title}</p>
              )}
            </div>

            {/* Genres */}
            {movie.genres && movie.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {movie.genres.map((g) => (
                  <span
                    key={g.id}
                    className="px-3 py-1 rounded-lg bg-surface border border-white/5 text-xs text-zinc-300"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Tagline */}
            {movie.tagline && (
              <p className="text-sm italic text-zinc-400 border-l-2 border-primary pl-3 py-0.5">
                «{movie.tagline}»
              </p>
            )}

            {/* Overview */}
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                Сюжет
              </h3>
              <p className="text-sm sm:text-base leading-relaxed text-zinc-300 max-w-3xl">
                {movie.overview || 'Описание фильма отсутствует.'}
              </p>
            </div>

            {/* Cast section */}
            {cast.length > 0 && (
              <div className="pt-4 border-t border-white/10">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" /> В главных ролях
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {cast.map((actor) => (
                    <div
                      key={actor.id}
                      className="p-2 rounded-xl bg-surface/50 border border-white/5 flex items-center gap-2.5"
                    >
                      <img
                        src={tmdb.getImageUrl(actor.profile_path, 'w300')}
                        alt={actor.name}
                        className="w-10 h-10 rounded-full object-cover bg-zinc-800 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{actor.name}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{actor.character}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Similar / Recommended carousel */}
        {recommendations.length > 0 && (
          <div className="mt-16 pt-8 border-t border-white/10">
            <MediaCarousel
              title="Похожие фильмы"
              items={recommendations}
              icon={<Sparkles className="w-5 h-5 text-primary" />}
            />
          </div>
        )}
      </div>

      {/* Torrent Search & Playback Modal */}
      <TorrentModal
        isOpen={isTorrentModalOpen}
        onClose={() => setIsTorrentModalOpen(false)}
        mediaTitle={title}
        originalTitle={movie.original_title}
        year={year}
        poster={posterUrl}
        mediaId={movie.id}
        mediaType="movie"
      />
    </div>
  );
}
