'use client';

import React, { useState, useEffect } from 'react';
import { Play, Calendar, Clock, Star, Loader2, CheckCircle2 } from 'lucide-react';
import { TVEpisode, TVSeasonDetails, TVSeasonSummary } from '@/types/tmdb';
import { tmdb } from '@/lib/tmdb';
import { formatRuntime } from '@/lib/utils';

interface EpisodeSelectorProps {
  tvId: number;
  seasons: TVSeasonSummary[];
  onSelectEpisode: (season: number, episode: number, episodeTitle: string) => void;
}

export default function EpisodeSelector({
  tvId,
  seasons,
  onSelectEpisode,
}: EpisodeSelectorProps) {
  // Filter out season 0 (Specials) unless only specials exist
  const validSeasons = seasons.filter((s) => s.season_number > 0);
  const initialSeason = validSeasons.length > 0 ? validSeasons[0].season_number : 1;

  const [activeSeasonNumber, setActiveSeasonNumber] = useState<number>(initialSeason);
  const [seasonData, setSeasonData] = useState<TVSeasonDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function loadSeason() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/tmdb/tv/${tvId}/season/${activeSeasonNumber}`);
        const data = await res.json();
        if (data.success) {
          setSeasonData(data.season);
        }
      } catch (e) {
        console.error('Failed to load season:', e);
      } finally {
        setIsLoading(false);
      }
    }

    loadSeason();
  }, [tvId, activeSeasonNumber]);

  return (
    <div className="space-y-4 sm:space-y-6 mt-5 sm:mt-8">
      {/* Season Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 scrollbar-none">
        {validSeasons.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSeasonNumber(s.season_number)}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap flex-shrink-0 transition-all ${
              activeSeasonNumber === s.season_number
                ? 'bg-primary text-white shadow-glow-primary'
                : 'bg-surface border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {s.name || `Сезон ${s.season_number}`}
          </button>
        ))}
      </div>

      {/* Episodes List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-zinc-400 text-xs sm:text-sm">
          <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-primary mr-2" />
          <span>Загрузка серий сезона...</span>
        </div>
      ) : seasonData && seasonData.episodes ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {seasonData.episodes.map((ep: TVEpisode) => (
            <div
              key={ep.id}
              className="group p-3 sm:p-3.5 rounded-xl bg-cinema-card border border-white/5 hover:border-primary/40 hover:bg-surface-hover transition-all flex gap-3 sm:gap-4"
            >
              {/* Episode still preview */}
              <div className="relative w-28 h-20 sm:w-36 sm:h-24 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                <img
                  src={tmdb.getImageUrl(ep.still_path, 'w300')}
                  alt={ep.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <button
                    onClick={() => onSelectEpisode(ep.season_number, ep.episode_number, ep.name)}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-primary/90 text-white flex items-center justify-center shadow-lg transform scale-95 group-hover:scale-100 transition-transform"
                  >
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-white ml-0.5" />
                  </button>
                </div>
                <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-zinc-200">
                  #{ep.episode_number}
                </div>
              </div>

              {/* Info & overview */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-zinc-100 group-hover:text-primary transition-colors truncate">
                    {ep.episode_number}. {ep.name || `Серия ${ep.episode_number}`}
                  </h4>
                  <div className="flex items-center gap-2.5 sm:gap-3 text-[11px] sm:text-xs text-zinc-400 mt-1">
                    {ep.runtime && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        {formatRuntime(ep.runtime)}
                      </span>
                    )}
                    {ep.vote_average > 0 && (
                      <span className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {ep.vote_average.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] sm:text-xs text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                    {ep.overview || 'Описание серии отсутствует.'}
                  </p>
                </div>

                <div className="pt-1.5 sm:pt-2">
                  <button
                    onClick={() => onSelectEpisode(ep.season_number, ep.episode_number, ep.name)}
                    className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-primary font-bold hover:underline"
                  >
                    <Play className="w-3 h-3 fill-primary" />
                    Найти торрент
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
