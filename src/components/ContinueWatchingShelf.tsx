'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Play, Clock, CheckCircle2, X, ChevronRight } from 'lucide-react';
import { storage, STORAGE_CHANGE_EVENT, WatchProgress } from '@/lib/storage';

export default function ContinueWatchingShelf() {
  const [items, setItems] = useState<WatchProgress[]>([]);

  useEffect(() => {
    function load() {
      setItems(storage.getAllProgress().filter((p) => p.hash && p.streamUrl));
    }
    load();
    window.addEventListener(STORAGE_CHANGE_EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, []);

  const handleRemove = (e: React.MouseEvent, p: WatchProgress) => {
    e.preventDefault();
    e.stopPropagation();
    storage.removeProgress(p.hash);
  };

  if (items.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Продолжить просмотр
          </h2>
        </div>
        <Link
          href="/favorites"
          className="text-xs font-semibold text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
        >
          Моё избранное <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-none">
        {items.map((item) => {
          const isTv = item.mediaType === 'tv' || Boolean(item.season || item.episode);
          const resumeUrl = `/watch?hash=${encodeURIComponent(item.hash)}&index=${item.fileIndex}&title=${encodeURIComponent(
            item.title + (item.season && item.episode ? ` S${item.season}E${item.episode}` : '')
          )}&streamUrl=${encodeURIComponent(item.streamUrl)}&poster=${encodeURIComponent(item.poster || '')}${
            item.mediaId ? `&mediaId=${item.mediaId}` : ''
          }&mediaType=${item.mediaType}${item.season ? `&season=${item.season}` : ''}${
            item.episode ? `&episode=${item.episode}` : ''
          }`;

          return (
            <div
              key={`${item.hash}-${item.fileIndex}`}
              className="group relative flex-shrink-0 w-60 sm:w-72 rounded-2xl bg-cinema-card border border-white/5 hover:border-primary/40 transition-all duration-300 overflow-hidden shadow-lg flex flex-col justify-between"
            >
              {/* Top thumbnail/poster */}
              <div className="relative aspect-video w-full bg-zinc-900 overflow-hidden">
                {item.poster ? (
                  <img
                    src={item.poster}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-surface">
                    <Play className="w-8 h-8" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-cinema-card via-black/30 to-transparent" />

                {/* Dismiss button */}
                <button
                  onClick={(e) => handleRemove(e, item)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-zinc-400 hover:text-white backdrop-blur-md transition-colors"
                  title="Убрать из истории"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Media type badge */}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider text-zinc-300 border border-white/10">
                  {isTv ? 'Сериал' : 'Фильм'}
                </div>

                {/* Play hover button */}
                <Link
                  href={resumeUrl}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
                >
                  <div className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-glow-primary transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  </div>
                </Link>

                {/* Progress bar line */}
                {item.progressPercent > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, Math.max(5, item.progressPercent))}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Info & Resume Action */}
              <div className="p-3.5 flex flex-col justify-between flex-1 space-y-2">
                <div>
                  <h4 className="text-sm font-bold text-white truncate group-hover:text-primary transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                    {isTv && (item.season || item.episode) ? (
                      <span>
                        {item.season ? `${item.season} сезон` : ''}
                        {item.season && item.episode ? ', ' : ''}
                        {item.episode ? `${item.episode} серия` : ''}
                      </span>
                    ) : item.progressPercent > 0 ? (
                      <span>Просмотрено {item.progressPercent}%</span>
                    ) : (
                      <span>Начато</span>
                    )}
                  </p>
                </div>

                <Link
                  href={resumeUrl}
                  className="w-full py-2 px-3 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-glow-primary transition-colors"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Продолжить
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
