'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Play,
  Star,
  Calendar,
  Layers,
  Users,
  Tv,
  Sparkles,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { MediaDetails } from '@/types/tmdb';
import { tmdb } from '@/lib/tmdb';
import { formatYear } from '@/lib/utils';
import { storage, WatchProgress, STORAGE_CHANGE_EVENT } from '@/lib/storage';
import TorrentModal from '@/components/TorrentModal';
import MediaCarousel from '@/components/MediaCarousel';
import EpisodeSelector from '@/components/EpisodeSelector';
import FavoriteButton from '@/components/FavoriteButton';

interface TVDetailClientProps {
  tv: MediaDetails;
}

export default function TVDetailClient({ tv }: TVDetailClientProps) {
  const [isTorrentModalOpen, setIsTorrentModalOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(undefined);
  const [selectedEpisode, setSelectedEpisode] = useState<number | undefined>(undefined);
  const [selectedEpisodeTitle, setSelectedEpisodeTitle] = useState<string | undefined>(undefined);
  const [savedProgress, setSavedProgress] = useState<WatchProgress | null>(null);

  const title = tv.name || tv.original_name || '';

  useEffect(() => {
    function loadProgress() {
      setSavedProgress(storage.getProgressByMediaId(tv.id, 'tv'));
    }
    loadProgress();
    window.addEventListener(STORAGE_CHANGE_EVENT, loadProgress);
    window.addEventListener('storage', loadProgress);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, loadProgress);
      window.removeEventListener('storage', loadProgress);
    };
  }, [tv.id]);
  const year = formatYear(tv.first_air_date);
  const backdropUrl = tmdb.getImageUrl(tv.backdrop_path || tv.poster_path, 'original');
  const posterUrl = tmdb.getImageUrl(tv.poster_path, 'w500');

  const cast = tv.credits?.cast?.slice(0, 8) || [];
  const recommendations = tv.recommendations?.results || tv.similar?.results || [];

  const handleOpenEntireSeriesTorrents = () => {
    setSelectedSeason(undefined);
    setSelectedEpisode(undefined);
    setSelectedEpisodeTitle(undefined);
    setIsTorrentModalOpen(true);
  };

  const handleSelectEpisode = (season: number, episode: number, episodeTitle: string) => {
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setSelectedEpisodeTitle(episodeTitle);
    setIsTorrentModalOpen(true);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Backdrop Header */}
      <div className="relative w-full h-[55vh] min-h-[450px] overflow-hidden">
        <img
          src={backdropUrl}
          alt={title}
          className="w-full h-full object-cover filter brightness-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-transparent" />
      </div>

      {/* Main Details Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-44 relative z-10">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* TV Poster */}
          <div className="w-56 sm:w-64 flex-shrink-0 mx-auto md:mx-0">
            <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-surface border border-white/10 shadow-2xl">
              <img src={posterUrl} alt={title} className="w-full h-full object-cover" />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 mt-4">
              <button
                onClick={handleOpenEntireSeriesTorrents}
                className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-sm flex items-center justify-center gap-2 shadow-glow-primary transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-5 h-5 fill-white" />
                Раздачи всего сериала
              </button>

              <FavoriteButton
                item={{
                  id: tv.id,
                  mediaType: 'tv',
                  title,
                  poster_path: tv.poster_path,
                  backdrop_path: tv.backdrop_path,
                  vote_average: tv.vote_average,
                  first_air_date: tv.first_air_date,
                }}
                showLabel={true}
                className="w-full justify-center"
              />
            </div>
          </div>

          {/* Details Column */}
          <div className="flex-1 space-y-5 text-zinc-300">
            {/* Continue Watching Banner */}
            {savedProgress && savedProgress.season && savedProgress.episode && (
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
                      {savedProgress.season} сезон, {savedProgress.episode} серия
                      {savedProgress.episodeTitle ? ` — «${savedProgress.episodeTitle}»` : ''}
                    </h4>
                    {savedProgress.progressPercent > 0 && (
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Просмотрено {savedProgress.progressPercent}%
                      </p>
                    )}
                  </div>
                </div>

                <Link
                  href={
                    savedProgress.hash && savedProgress.streamUrl
                      ? `/watch?hash=${encodeURIComponent(savedProgress.hash)}&index=${savedProgress.fileIndex}&title=${encodeURIComponent(
                          title + ` S${savedProgress.season}E${savedProgress.episode}`
                        )}&streamUrl=${encodeURIComponent(savedProgress.streamUrl)}&poster=${encodeURIComponent(posterUrl)}&mediaId=${tv.id}&mediaType=tv&season=${savedProgress.season}&episode=${savedProgress.episode}`
                      : '#'
                  }
                  onClick={(e) => {
                    if (!savedProgress.hash) {
                      e.preventDefault();
                      handleSelectEpisode(savedProgress.season!, savedProgress.episode!, savedProgress.episodeTitle || '');
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center justify-center gap-2 shadow-glow-primary transition-all flex-shrink-0"
                >
                  <Play className="w-4 h-4 fill-white" />
                  Продолжить просмотр
                </Link>
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-2.5 py-0.5 rounded-md bg-white/10 text-xs font-semibold uppercase text-zinc-300">
                  Сериал
                </span>
                {year && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                    {year}
                  </span>
                )}
                {tv.number_of_seasons && (
                  <span className="flex items-center gap-1 text-xs text-zinc-400">
                    <Layers className="w-3.5 h-3.5 text-zinc-500" />
                    Сезонов: {tv.number_of_seasons} (серий: {tv.number_of_episodes || '—'})
                  </span>
                )}
                {tv.vote_average > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 text-amber-400 font-bold text-xs">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {tv.vote_average.toFixed(1)} / 10
                  </span>
                )}
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight mt-2">
                {title}
              </h1>

              {tv.original_name && tv.original_name !== title && (
                <p className="text-sm text-zinc-400 mt-1">{tv.original_name}</p>
              )}
            </div>

            {/* Genres */}
            {tv.genres && tv.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tv.genres.map((g) => (
                  <span
                    key={g.id}
                    className="px-3 py-1 rounded-lg bg-surface border border-white/5 text-xs text-zinc-300"
                  >
                    {g.name}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
                Сюжет
              </h3>
              <p className="text-sm sm:text-base leading-relaxed text-zinc-300 max-w-3xl">
                {tv.overview || 'Описание сериала отсутствует.'}
              </p>
            </div>

            {/* Cast */}
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

        {/* Episode Selector Section */}
        {tv.seasons && tv.seasons.length > 0 && (
          <div className="mt-14 pt-8 border-t border-white/10">
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Tv className="w-6 h-6 text-primary" /> Эпизоды и сезоны
            </h2>
            <EpisodeSelector
              tvId={tv.id}
              seasons={tv.seasons}
              onSelectEpisode={handleSelectEpisode}
            />
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="mt-16 pt-8 border-t border-white/10">
            <MediaCarousel
              title="Похожие сериалы"
              items={recommendations}
              icon={<Sparkles className="w-5 h-5 text-primary" />}
            />
          </div>
        )}
      </div>

      {/* Torrent Modal */}
      <TorrentModal
        isOpen={isTorrentModalOpen}
        onClose={() => setIsTorrentModalOpen(false)}
        mediaTitle={title}
        originalTitle={tv.original_name}
        year={year}
        poster={posterUrl}
        mediaId={tv.id}
        mediaType="tv"
        season={selectedSeason}
        episode={selectedEpisode}
        episodeTitle={selectedEpisodeTitle}
      />
    </div>
  );
}
