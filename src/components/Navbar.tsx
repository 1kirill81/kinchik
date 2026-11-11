'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Film, Search, X, Star, Tv, Clapperboard, Loader2, Heart, User, LogOut, Menu, Home } from 'lucide-react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/85 backdrop-blur-md transition-all">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 md:py-0 md:h-16 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-3 gap-y-2.5">
          {/* Brand Logo */}
          <Link
            href="/"
            onClick={() => setIsMobileMenuOpen(false)}
            className="order-1 flex items-center gap-2 group flex-shrink-0"
          >
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-glow-primary transition-transform group-hover:scale-105">
              <Film className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg md:text-xl tracking-wider text-white">
                KINO<span className="text-primary">STREAM</span>
              </span>
              <span className="text-[9px] md:text-[10px] uppercase tracking-widest text-zinc-400 font-semibold -mt-1">
                TorrServer P2P
              </span>
            </div>
          </Link>

          {/* Desktop Navigation links */}
          <nav className="order-2 hidden md:flex items-center gap-4 lg:gap-6 text-sm font-medium text-zinc-300">
            <Link href="/" className="hover:text-white transition-colors whitespace-nowrap">
              Главная
            </Link>
            <Link href="/?category=movie" className="hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap">
              <Clapperboard className="w-4 h-4 text-zinc-400" /> Фильмы
            </Link>
            <Link href="/?category=tv" className="hover:text-white transition-colors flex items-center gap-1.5 whitespace-nowrap">
              <Tv className="w-4 h-4 text-zinc-400" /> Сериалы
            </Link>
            <Link
              href="/favorites"
              className="hover:text-white transition-colors flex items-center gap-1.5 text-zinc-200 whitespace-nowrap"
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

          {/* Right Controls: Mobile Favorites Shortcut, User Auth & Mobile Menu Toggle */}
          <div className="order-3 md:order-4 flex items-center gap-2 flex-shrink-0">
            {/* Quick Favorites Shortcut for Mobile/Tablet */}
            <Link
              href="/favorites"
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden relative p-2 rounded-xl bg-surface border border-white/10 text-zinc-200 hover:bg-white/10 transition-colors"
              aria-label="Избранное"
              title="Избранное"
            >
              <Heart className="w-4 h-4 text-primary fill-primary" />
              {favCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 min-w-[18px] text-center rounded-full bg-primary text-[9px] font-black text-white leading-none shadow-glow-primary">
                  {favCount}
                </span>
              )}
            </Link>

            {currentUser ? (
              <div className="flex items-center gap-1.5 sm:gap-2 p-1 pl-2.5 sm:pl-3 rounded-xl bg-surface border border-white/10 text-xs shadow-md max-w-[140px] sm:max-w-none">
                <span className="font-semibold text-white flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="truncate">{currentUser.username}</span>
                </span>
                <button
                  onClick={() => authClient.logout()}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-white/5 transition-colors flex-shrink-0"
                  title="Выйти из аккаунта"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-surface hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors shadow-md"
              >
                <User className="w-3.5 h-3.5 text-primary" />
                <span>Войти</span>
              </button>
            )}

            {/* Mobile Hamburger Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-xl bg-surface border border-white/10 text-zinc-200 hover:bg-white/10 transition-colors"
              aria-label="Меню"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

          {/* Live Search Bar (Full width Row 2 on Phones, Row 1 on >= sm) */}
          <div ref={searchRef} className="order-4 sm:order-3 relative w-full sm:w-auto sm:flex-1 sm:max-w-md">
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
              <div className="absolute top-full left-0 right-0 mt-2 bg-surface/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
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
        </div>

        {/* Mobile / Small Tablet Drawer Menu */}
        {isMobileMenuOpen && (
          <nav className="md:hidden border-t border-white/10 bg-background/95 backdrop-blur-xl px-4 py-3 space-y-1 animate-fade-in">
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Home className="w-4 h-4 text-zinc-400" />
              <span>Главная</span>
            </Link>
            <Link
              href="/?category=movie"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Clapperboard className="w-4 h-4 text-zinc-400" />
              <span>Фильмы</span>
            </Link>
            <Link
              href="/?category=tv"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-200 hover:bg-white/5 hover:text-white transition-colors"
            >
              <Tv className="w-4 h-4 text-zinc-400" />
              <span>Сериалы</span>
            </Link>
            <Link
              href="/favorites"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/5 hover:bg-white/10 transition-colors"
            >
              <span className="flex items-center gap-3">
                <Heart className="w-4 h-4 text-primary fill-primary" />
                <span>Моё избранное</span>
              </span>
              {favCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary text-[11px] font-black text-white">
                  {favCount}
                </span>
              )}
            </Link>
          </nav>
        )}
      </header>

      {/* Auth Modal rendered outside header */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
}
