import React from 'react';
import { Film, Radio, HardDrive, ShieldCheck } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/10 bg-cinema-dark mt-20 text-zinc-400 text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
          {/* Logo & description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Film className="w-5 h-5 text-primary" />
              <span className="font-bold text-white tracking-wide">KINOSTREAM</span>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Современный онлайн-кинотеатр с прямой трансляцией P2P-потоков через TorrServer без предварительного скачивания на диск.
            </p>
          </div>

          {/* Architecture badges */}
          <div className="flex flex-wrap gap-2 justify-start md:justify-center">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-white/5 text-xs text-zinc-300">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> TorrServer MatriX
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-white/5 text-xs text-zinc-300">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400" /> Jackett / Prowlarr
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface border border-white/5 text-xs text-zinc-300">
              <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Next.js 14 App Router
            </span>
          </div>

          {/* Copyright notice */}
          <div className="text-left md:text-right text-xs text-zinc-500">
            <p>Данные предоставлены TMDB API.</p>
            <p className="mt-1">Видеопотоки транслируются напрямую с пиров торрент-сети.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
