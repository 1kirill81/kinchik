'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Film, Search, X, Star, Tv, Clapperboard, Loader2, Heart, User, LogOut, LogIn } from 'lucide-react';
import { MediaItem } from '@/types/tmdb';
import { tmdb } from '@/lib/tmdb';
import { formatYear } from '@/lib/utils';
import { storage, STORAGE_CHANGE_EVENT } from '@/lib/storage';
import { authClient, AUTH_CHANGE_EVENT, User as AuthUser } from '@/lib/authClient';
import AuthModal from './AuthModal';

export default function Navbar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [favCount, setFavCount] = useState(0);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Sync favorites count & auth user
  useEffect(() => {
    const updateCount = () => {
      setFavCount(storage.getFavorites().length);
    };
    updateCount();

    const handleAuthSync = () => {
      setCurrentUser(authClient.getUser());
      storage.syncWithServer();
    };

    authClient.checkAuth().then((user) => {
      setCurrentUser(user);
      if (user) {
        storage.syncWithServer();
      }
    });

    window.addEventListener(STORAGE_CHANGE_EVENT, updateCount);
    window.addEventListener('storage', updateCount);
    window.addEventListener(AUTH_CHANGE_EVENT, handleAuthSync);

    return () => {
      window.removeEventListener(STORAGE_CHANGE_EVENT, updateCount);
      window.removeEventListener('storage', updateCount);
      window.removeEventListener(AUTH_CHANGE_EVENT, handleAuthSync);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (data.success) {
          setResults(data.items.slice(0, 7));
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: MediaItem) => {
    setIsOpen(false);
    setSearchQuery('');
    router.push(`/${item.media_type}/${item.id}`);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-glow-primary transition-transform group-hover:scale-105">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-xl tracking-wider text-white">
                KINO<span className="text-primary">STREAM</span>
              </span>
              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold -mt-1">
                TorrServer P2P
              </span>
            </div>
          </Link>

          {/* Navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-300">
            <Link href="/" className="hover:text-white transition-colors">
              Главная
            </Link>
            <Link href="/?category=movie" className="hover:text-white transition-colors flex items-center gap-1.5">
              <Clapperboard className="w-4 h-4 text-zinc-400" /> Фильмы
            </Link>
            <Link href="/?category=tv" className="hover:text-white transition-colors flex items-center gap-1.5">
              <Tv className="w-4 h-4 text-zinc-400" /> Сериалы
            </Link>
            <Link
              href="/favorites"
              className="hover:text-white transition-colors flex items-center gap-1.5 text-zinc-200"
            >
              <Heart className="w-4 h-4 text-primary fill-primary" />
              <span>Избранное</span>
              {favCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-primary text-[10px] font-black text-white leading-none shadow-glow-primary">
                  {favCount}
                </span>
              )}
            </Link>
          </nav>

          {/* Live Search Bar */}
          <div ref={searchRef} className="relative flex-1 max-w-md">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 w-4 h-4 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Поиск фильмов и сериалов..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                className="w-full pl-10 pr-9 py-2 rounded-xl bg-surface border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-transparent transition-all"
              />
              {isLoading ? (
                <Loader2 className="absolute right-3 w-4 h-4 text-zinc-400 animate-spin" />
              ) : searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 p-0.5 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {/* Search Dropdown Results */}
            {isOpen && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-surface/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-white/5">
                {results.map((item) => (
                  <div
                    key={`${item.media_type}-${item.id}`}
                    onClick={() => handleSelect(item)}
                    className="flex items-center gap-3 p-2.5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <img
                      src={tmdb.getImageUrl(item.poster_path, 'w300')}
                      alt={item.title || item.name || ''}
                      className="w-10 h-14 object-cover rounded-lg bg-zinc-800 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {item.title || item.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] uppercase font-semibold text-zinc-300">
                          {item.media_type === 'movie' ? 'Фильм' : 'Сериал'}
                        </span>
                        <span>{formatYear(item.release_date || item.first_air_date)}</span>
                        {item.vote_average > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-400 font-semibold">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {item.vote_average.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User Auth Profile / Login Button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2 p-1 pl-3 rounded-xl bg-surface border border-white/10 text-xs shadow-md">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {currentUser.username}
                </span>
                <button
                  onClick={() => authClient.logout()}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-white/5 transition-colors"
                  title="Выйти из аккаунта"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors shadow-md"
              >
                <User className="w-3.5 h-3.5 text-primary" />
                <span>Войти</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Auth Modal rendered outside header */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
}
