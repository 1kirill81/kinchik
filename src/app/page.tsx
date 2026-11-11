import React from 'react';
import { Flame, Film, Tv, Settings } from 'lucide-react';
import { tmdb } from '@/lib/tmdb';
import HeroBanner from '@/components/HeroBanner';
import MediaCarousel from '@/components/MediaCarousel';
import ContinueWatchingShelf from '@/components/ContinueWatchingShelf';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [trending, popularMovies, popularTV] = await Promise.all([
    tmdb.getTrending('all', 'day'),
    tmdb.getPopularMovies(1),
    tmdb.getPopularTV(1),
  ]);

  const heroItem = trending.length > 0 ? trending[0] : null;
  const isTmdbConfigured = Boolean(process.env.TMDB_API_KEY);

  return (
    <div className="min-h-screen">
      {/* TMDB API key missing warning helper */}
      {!isTmdbConfigured && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300 py-3 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-400 animate-spin" />
              <span>
                <strong>Внимание:</strong> Не указан <code>TMDB_API_KEY</code> в файле <code>.env.local</code>. Получите бесплатный ключ на themoviedb.org для загрузки каталога.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Hero Banner */}
      {heroItem && <HeroBanner item={heroItem} />}

      {/* Continue Watching for active user streams */}
      <ContinueWatchingShelf />

      {/* Main Content Shelves */}
      <div className="space-y-4 -mt-4 sm:-mt-12 md:-mt-16 relative z-20">
        {/* Trending Shelf */}
        <MediaCarousel
          title="В тренде сегодня"
          items={trending}
          icon={<Flame className="w-6 h-6 text-primary fill-primary" />}
        />

        {/* Popular Movies */}
        <MediaCarousel
          title="Популярные фильмы"
          items={popularMovies}
          icon={<Film className="w-6 h-6 text-primary" />}
        />

        {/* Popular TV Shows */}
        <MediaCarousel
          title="Популярные сериалы"
          items={popularTV}
          icon={<Tv className="w-6 h-6 text-primary" />}
        />
      </div>
    </div>
  );
}
