'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Search,
  Download,
  Users,
  Play,
  Loader2,
  AlertTriangle,
  Radio,
  FileVideo,
  CheckCircle2,
  Zap,
  Sparkles,
} from 'lucide-react';
import { TorrentItem, VideoQuality } from '@/types/torrent';

interface TorrentModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaTitle: string;
  originalTitle?: string;
  year?: string;
  poster?: string;
  mediaId?: number;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  episodeTitle?: string;
}

export default function TorrentModal({
  isOpen,
  onClose,
  mediaTitle,
  originalTitle,
  year,
  poster,
  mediaId,
  mediaType,
  season,
  episode,
  episodeTitle,
}: TorrentModalProps) {
  const router = useRouter();

  // Search state
  const [query, setQuery] = useState('');
  const [torrents, setTorrents] = useState<TorrentItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [selectedQuality, setSelectedQuality] = useState<string>('all');

  // Custom Magnet State
  const [customMagnet, setCustomMagnet] = useState('');
  const [showMagnetInput, setShowMagnetInput] = useState(false);

  // Preparation state
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparingTitle, setPreparingTitle] = useState<string>('');
  const [prepareStep, setPrepareStep] = useState<string>('');

  const handleSearchGeneral = () => {
    const base = mediaTitle || originalTitle || '';
    setQuery(base);
    fetchTorrents(base);
  };

  const handleSearchEnglish = () => {
    if (originalTitle) {
      setQuery(originalTitle);
      fetchTorrents(originalTitle);
    }
  };

  // Initial load
  useEffect(() => {
    if (isOpen) {
      const defaultQuery = mediaTitle || originalTitle || '';
      setQuery(defaultQuery);
      fetchTorrents(defaultQuery);
    }
  }, [isOpen, mediaTitle, season, episode]);

  const fetchTorrents = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: searchQuery,
      });
      if (year) params.append('year', year);
      if (season) params.append('season', String(season));
      if (episode) params.append('episode', String(episode));

      const res = await fetch(`/api/torrents/search?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ошибка при поиске торрентов');
      }

      setTorrents(data.items || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Не удалось найти раздачи. Проверьте подключение к Jackett.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartStream = async (torrent: TorrentItem) => {
    setIsPreparing(true);
    setPreparingTitle(torrent.title);
    setPrepareStep('Добавление раздачи в TorrServer...');

    try {
      const link = torrent.magnetUrl || torrent.link;
      const res = await fetch('/api/stream/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link,
          title: mediaTitle,
          poster,
          season,
          episode,
        }),
      });

      setPrepareStep('Получение списка файлов и выбор лучшего видео...');

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось запустить воспроизведение');
      }

      setPrepareStep('Запуск буфера и открытие плеера...');

      // Always launch in browser-compatible Remux mode for 100% reliable audio & video
      const needRemux = true;

      // Redirect to full-featured watch cinema page
      const watchUrl = `/watch?hash=${encodeURIComponent(data.hash)}&index=${data.fileIndex}&title=${encodeURIComponent(
        mediaTitle + (season && episode ? ` S${season}E${episode}` : '')
      )}&streamUrl=${encodeURIComponent(data.streamUrl)}&poster=${encodeURIComponent(poster || '')}${
        mediaId ? `&mediaId=${mediaId}` : ''
      }${mediaType ? `&mediaType=${mediaType}` : ''}${
        season ? `&season=${season}` : ''
      }${episode ? `&episode=${episode}` : ''}${
        needRemux ? '&remux=1' : ''
      }`;

      router.push(watchUrl);
    } catch (err: any) {
      alert(err.message || 'Ошибка запуска видеопотока в TorrServer');
      setIsPreparing(false);
    }
  };

  if (!isOpen) return null;

  const filteredTorrents = torrents.filter((item) => {
    if (selectedQuality === 'browser') return item.isBrowserNative;
    if (selectedQuality === 'all') return true;
    return item.quality === selectedQuality;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-surface/50">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
              <h2 className="text-lg font-bold text-white">
                Доступные раздачи для стриминга
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {mediaTitle} {year && `(${year})`}
              {season && episode && ` • Сезон ${season}, Серия ${episode}`}
              {episodeTitle && ` — «${episodeTitle}»`}
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isPreparing}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar & Quality Filter */}
        <div className="p-4 border-b border-white/5 space-y-3 bg-zinc-900/40">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchTorrents(query);
            }}
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поисковый запрос для Jackett..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-surface border border-white/10 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || isPreparing}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Искать
            </button>
          </form>

          {/* Quality tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            <span className="text-zinc-500 font-medium">Фильтр:</span>
            <button
              onClick={() => setSelectedQuality('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                selectedQuality === 'all'
                  ? 'bg-primary text-white shadow-glow-primary'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              Все
            </button>

            {/* Quick 1-click filter for native browser-compatible torrents */}
            <button
              onClick={() => setSelectedQuality(selectedQuality === 'browser' ? 'all' : 'browser')}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                selectedQuality === 'browser'
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-1 ring-emerald-400'
                  : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/40 border border-emerald-500/30'
              }`}
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>Для браузера (H.264)</span>
            </button>

            {['4K', '1080p', '720p'].map((q) => (
              <button
                key={q}
                onClick={() => setSelectedQuality(q)}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  selectedQuality === q
                    ? 'bg-primary text-white shadow-glow-primary'
                    : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {q}
              </button>
            ))}
            <span className="ml-auto text-zinc-500">
              Найдено: <b className="text-zinc-300">{filteredTorrents.length}</b>
            </span>
          </div>
        </div>

        {/* Content list or Loading/Error State */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
          {isPreparing ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center space-y-4">
              <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin flex items-center justify-center">
                <Play className="w-6 h-6 text-primary fill-primary ml-1" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Подготовка стрима...</h3>
                <p className="text-sm text-zinc-400 mt-1 max-w-md">{prepareStep}</p>
                <p className="text-xs text-zinc-500 mt-2 truncate max-w-sm">{preparingTitle}</p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center space-y-3 text-zinc-400">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Опрашиваем трекеры через Jackett...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Ошибка поиска</h4>
                <p className="text-xs mt-1 text-red-400/90">{error}</p>
              </div>
            </div>
          ) : filteredTorrents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center space-y-4 text-zinc-400">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-zinc-500">
                <FileVideo className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Раздачи не найдены</p>
                <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                  Сериалы на трекерах чаще всего выкладывают <b>полными сезонами (паками)</b>, а не отдельными сериями.
                </p>
              </div>

              {/* Helpful quick actions */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1 max-w-md">
                <button
                  onClick={handleSearchGeneral}
                  className="px-3.5 py-2 rounded-xl bg-primary text-white text-xs font-semibold shadow-glow-primary hover:bg-primary-hover transition-colors"
                >
                  Искать сериал целиком
                </button>

                {originalTitle && originalTitle !== mediaTitle && (
                  <button
                    onClick={handleSearchEnglish}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors border border-white/10"
                  >
                    По названию «{originalTitle}»
                  </button>
                )}

                <button
                  onClick={() => setShowMagnetInput(!showMagnetInput)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors border border-white/5"
                >
                  {showMagnetInput ? 'Скрыть ввод ссылки' : 'Вставить Magnet-ссылку'}
                </button>
              </div>

              {showMagnetInput && (
                <div className="w-full max-w-md p-3 rounded-xl bg-black/60 border border-white/10 space-y-2 mt-2">
                  <input
                    type="text"
                    placeholder="magnet:?xt=urn:btih:... или ссылка на .torrent"
                    value={customMagnet}
                    onChange={(e) => setCustomMagnet(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => {
                      if (!customMagnet.trim()) return;
                      handleStartStream({
                        id: 'custom',
                        title: mediaTitle || 'Пользовательский поток',
                        link: customMagnet.trim(),
                        magnetUrl: customMagnet.trim(),
                        size: 0,
                        formattedSize: 'P2P',
                        seeders: 1,
                        peers: 0,
                        indexer: 'Custom',
                        publishDate: new Date().toISOString(),
                        category: [2000],
                        quality: '1080p',
                      });
                    }}
                    disabled={!customMagnet.trim()}
                    className="w-full py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-bold disabled:opacity-40"
                  >
                    Запустить стрим по этой ссылке
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredTorrents.map((torrent) => (
              <div
                key={torrent.id}
                className="group relative p-4 rounded-xl bg-cinema-card border border-white/5 hover:border-primary/40 hover:bg-surface-hover transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Torrent details */}
                <div className="flex-1 min-w-0 space-y-2">
                  <h4 className="text-sm font-semibold text-zinc-100 group-hover:text-primary transition-colors leading-snug break-words">
                    {torrent.title}
                  </h4>

                  {/* Badges row */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {/* Browser Compatibility Badge */}
                    {torrent.isBrowserNative ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 text-[10px] shadow-sm">
                        <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                        H.264 (Легкий поток)
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300/90 font-medium border border-amber-500/25 text-[10px]"
                        title="Раздача в MKV/HEVC/AC3"
                      >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Режим MP4
                      </span>
                    )}

                    {/* Quality */}
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        torrent.quality === '4K'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : torrent.quality === '1080p'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {torrent.quality}
                    </span>

                    {/* Rip & Codec */}
                    {torrent.ripType && (
                      <span className="px-2 py-0.5 rounded bg-white/10 text-zinc-300 font-medium">
                        {torrent.ripType}
                      </span>
                    )}
                    {torrent.codec && (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                        {torrent.codec}
                      </span>
                    )}

                    {/* Audio translation */}
                    {torrent.audio && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
                        {torrent.audio}
                      </span>
                    )}

                    {/* Tracker */}
                    <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                      {torrent.indexer}
                    </span>
                  </div>
                </div>

                {/* Metrics & Play Action */}
                <div className="flex items-center justify-between sm:justify-end gap-5 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                  <div className="flex items-center gap-4 text-xs">
                    {/* Size */}
                    <div className="text-right">
                      <span className="block font-bold text-zinc-200">{torrent.formattedSize}</span>
                      <span className="text-[10px] text-zinc-500">Размер</span>
                    </div>

                    {/* Seeders / Peers */}
                    <div className="text-right">
                      <div className="flex items-center gap-1 font-bold">
                        <span
                          className={`flex items-center ${
                            torrent.seeders > 15
                              ? 'text-emerald-400'
                              : torrent.seeders > 0
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}
                        >
                          <Download className="w-3 h-3 mr-0.5" />
                          {torrent.seeders}
                        </span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-zinc-400 flex items-center">
                          <Users className="w-3 h-3 mr-0.5" />
                          {torrent.peers}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500">Сиды / Пиры</span>
                    </div>
                  </div>

                  {/* Stream Button */}
                  <button
                    onClick={() => handleStartStream(torrent)}
                    disabled={torrent.seeders === 0}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md ${
                      torrent.seeders === 0
                        ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        : 'bg-primary hover:bg-primary-hover text-white shadow-glow-primary active:scale-95'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    Смотреть
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
