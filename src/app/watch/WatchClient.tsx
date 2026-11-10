'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Film,
  Download,
  Users,
  HardDrive,
  FileVideo,
  ListVideo,
  RefreshCw,
  Radio,
  Share2,
  ChevronLeft,
  ChevronRight,
  Tv,
  Play,
  CheckCircle2,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { TorrServerFile, TorrServerTorrent, ParsedEpisodeFile } from '@/types/torrent';
import { formatBytes } from '@/lib/utils';
import { isVideoFile, isSampleFile } from '@/lib/torrserver';
import { storage } from '@/lib/storage';
import FavoriteButton from '@/components/FavoriteButton';

const VideoPlayer = dynamic(() => import('@/components/VideoPlayer'), {
  ssr: false,
  loading: () => (
    <div className="w-full aspect-video rounded-2xl bg-black flex items-center justify-center text-zinc-400 border border-white/10">
      <div className="flex items-center gap-2">
        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span>Инициализация видеоплеера...</span>
      </div>
    </div>
  ),
});

/**
 * Smart episode extractor from filename or folder path
 */
function parseEpisodeFromFile(file: { id: number; path: string; length: number }): ParsedEpisodeFile {
  const parts = file.path.split(/[/\\]/);
  const filename = parts.pop() || file.path;
  const parentFolder = parts.length > 0 ? parts[parts.length - 1] : '';
  const cleanName = filename.replace(/\.[^/.]+$/, ''); // remove extension

  let season = 1;
  let episode = file.id;
  let epTitle = cleanName;

  // 1. Check parent folder for Season NN
  const folderSeasonMatch = parentFolder.match(/season\s*(\d+)/i) || file.path.match(/season\s*(\d+)/i);
  if (folderSeasonMatch) {
    season = parseInt(folderSeasonMatch[1], 10);
  }

  // 2. Check S01E03 or s1e3
  const seMatch = cleanName.match(/s(\d+)[\.\s_-]*e(\d+)/i);
  if (seMatch) {
    season = parseInt(seMatch[1], 10);
    episode = parseInt(seMatch[2], 10);
    epTitle = cleanName.replace(/.*s\d+[\.\s_-]*e\d+[\.\s_–-]*/i, '').trim();
  } else {
    // 3. Check 1x03
    const altMatch = cleanName.match(/(\d+)x(\d+)/i);
    if (altMatch) {
      season = parseInt(altMatch[1], 10);
      episode = parseInt(altMatch[2], 10);
      epTitle = cleanName.replace(/.*(\d+)x(\d+)[\.\s_–-]*/i, '').trim();
    } else {
      // 4. Check "03 серия" or "серия 03"
      const ruMatch = cleanName.match(/(?:серия|эпизод|ep)[\s._-]*(\d+)/i) || cleanName.match(/(\d+)\s*(?:серия|эпизод)/i);
      if (ruMatch) {
        episode = parseInt(ruMatch[1], 10);
      }
    }
  }

  if (!epTitle || epTitle === cleanName) {
    epTitle = `Серия ${episode}`;
  }

  return {
    id: file.id,
    path: file.path,
    season,
    episode,
    title: epTitle,
    length: file.length,
    formattedSize: formatBytes(file.length),
  };
}

export default function WatchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const hash = searchParams.get('hash') || '';
  const initialIndex = parseInt(searchParams.get('index') || '1', 10);
  const rawTitle = searchParams.get('title') || 'Видеопоток';
  const initialStreamUrl = searchParams.get('streamUrl') || '';
  const poster = searchParams.get('poster') || '';
  const mediaId = searchParams.get('mediaId') || '';
  const mediaType = searchParams.get('mediaType') || '';

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [streamUrl, setStreamUrl] = useState<string>(initialStreamUrl);
  const [torrentData, setTorrentData] = useState<TorrServerTorrent | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [isRemux, setIsRemux] = useState(false);
  const [copiedTop, setCopiedTop] = useState(false);

  // Active season tab for series
  const [activeSeason, setActiveSeason] = useState<number>(1);

  // Load files list from TorrServer for this torrent
  useEffect(() => {
    if (!hash) return;

    async function loadTorrentInfo() {
      setIsLoadingFiles(true);
      try {
        const res = await fetch(`/api/torrents/${encodeURIComponent(hash)}`);
        const data = await res.json();
        if (data.success && data.torrent) {
          setTorrentData(data.torrent);
        }
      } catch (err) {
        console.error('Failed to load torrent info:', err);
      } finally {
        setIsLoadingFiles(false);
      }
    }

    loadTorrentInfo();
  }, [hash]);

  // Update stream URL if index, proxy, or remux option changes
  useEffect(() => {
    if (!hash) return;

    if (isRemux) {
      setStreamUrl(`/api/stream/remux?link=${hash}&index=${currentIndex}&title=${encodeURIComponent(rawTitle)}`);
      return;
    }

    const publicHost = (process.env.NEXT_PUBLIC_TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');
    let url = `${publicHost}/stream/${encodeURIComponent(rawTitle)}?link=${hash}&index=${currentIndex}&play`;

    if (useProxy) {
      url = `/api/stream/proxy?link=${hash}&index=${currentIndex}&title=${encodeURIComponent(rawTitle)}`;
    }

    setStreamUrl(url);
  }, [hash, currentIndex, rawTitle, useProxy, isRemux]);

  // Parse all video files in torrent
  const parsedEpisodes = useMemo<ParsedEpisodeFile[]>(() => {
    const rawFiles = torrentData?.file_stats || [];
    return rawFiles
      .filter((f) => isVideoFile(f.path) && !isSampleFile(f.path))
      .map(parseEpisodeFromFile);
  }, [torrentData]);

  // Group episodes by season
  const seasonsMap = useMemo(() => {
    const map = new Map<number, ParsedEpisodeFile[]>();
    parsedEpisodes.forEach((ep) => {
      const list = map.get(ep.season) || [];
      list.push(ep);
      map.set(ep.season, list);
    });

    // Sort episodes inside each season by episode number
    map.forEach((list) => {
      list.sort((a, b) => a.episode - b.episode);
    });

    return map;
  }, [parsedEpisodes]);

  const availableSeasons = useMemo(() => {
    return Array.from(seasonsMap.keys()).sort((a, b) => a - b);
  }, [seasonsMap]);

  // Set active season based on current playing file
  useEffect(() => {
    const currentEp = parsedEpisodes.find((ep) => ep.id === currentIndex);
    if (currentEp && availableSeasons.includes(currentEp.season)) {
      setActiveSeason(currentEp.season);
    } else if (availableSeasons.length > 0 && !availableSeasons.includes(activeSeason)) {
      setActiveSeason(availableSeasons[0]);
    }
  }, [currentIndex, parsedEpisodes, availableSeasons]);

  // Find currently active episode info
  const currentEpisodeInfo = useMemo(() => {
    return parsedEpisodes.find((ep) => ep.id === currentIndex) || null;
  }, [parsedEpisodes, currentIndex]);

  // Next / Previous episode handlers
  const currentEpIndexInList = parsedEpisodes.findIndex((ep) => ep.id === currentIndex);
  const prevEpisode = currentEpIndexInList > 0 ? parsedEpisodes[currentEpIndexInList - 1] : null;
  const nextEpisode = currentEpIndexInList >= 0 && currentEpIndexInList < parsedEpisodes.length - 1
    ? parsedEpisodes[currentEpIndexInList + 1]
    : null;

  const paramSeason = searchParams.get('season');
  const paramEpisode = searchParams.get('episode');

  // Load existing progress to resume playback
  const savedProgress = useMemo(() => {
    if (typeof window === 'undefined') return null;
    if (mediaId) {
      return storage.getProgressByMediaId(
        parseInt(mediaId, 10),
        (mediaType as 'movie' | 'tv') || 'tv'
      );
    }
    return storage.getProgressByHash(hash);
  }, [mediaId, mediaType, hash]);

  // Initial seek time if resuming the exact same file
  const initialTime = useMemo(() => {
    if (
      savedProgress &&
      savedProgress.fileIndex === initialIndex &&
      savedProgress.currentTime > 5 &&
      (!savedProgress.duration || savedProgress.currentTime < savedProgress.duration - 15)
    ) {
      return savedProgress.currentTime;
    }
    return 0;
  }, [savedProgress, initialIndex]);

  // Throttled timeupdate progress saving
  const lastSavedRef = useRef<number>(0);

  const handleTimeUpdate = (currentTime: number, duration: number) => {
    const now = Date.now();
    if (now - lastSavedRef.current < 4000) return;
    lastSavedRef.current = now;

    const currentEp = parsedEpisodes.find((ep) => ep.id === currentIndex);
    const seasonNum =
      currentEp?.season ||
      (paramSeason ? parseInt(paramSeason, 10) : mediaType === 'tv' ? 1 : undefined);
    const epNum = currentEp?.episode || (paramEpisode ? parseInt(paramEpisode, 10) : undefined);
    const epTitle = currentEp?.title || (epNum ? `Серия ${epNum}` : undefined);

    storage.saveProgress({
      mediaId: mediaId ? parseInt(mediaId, 10) : undefined,
      mediaType: (mediaType as 'movie' | 'tv') || (seasonNum || epNum ? 'tv' : 'movie'),
      title: rawTitle,
      poster,
      hash,
      fileIndex: currentIndex,
      streamUrl,
      season: seasonNum,
      episode: epNum,
      episodeTitle: epTitle,
      currentTime,
      duration,
      progressPercent: duration > 0 ? Math.round((currentTime / duration) * 100) : 0,
      updatedAt: Date.now(),
    });
  };

  // Immediate save on episode/file change
  useEffect(() => {
    if (!hash || !streamUrl) return;

    const currentEp = parsedEpisodes.find((ep) => ep.id === currentIndex);
    const seasonNum =
      currentEp?.season ||
      (paramSeason ? parseInt(paramSeason, 10) : mediaType === 'tv' ? 1 : undefined);
    const epNum = currentEp?.episode || (paramEpisode ? parseInt(paramEpisode, 10) : undefined);
    const epTitle = currentEp?.title || (epNum ? `Серия ${epNum}` : undefined);

    storage.saveProgress({
      mediaId: mediaId ? parseInt(mediaId, 10) : undefined,
      mediaType: (mediaType as 'movie' | 'tv') || (seasonNum || epNum ? 'tv' : 'movie'),
      title: rawTitle,
      poster,
      hash,
      fileIndex: currentIndex,
      streamUrl,
      season: seasonNum,
      episode: epNum,
      episodeTitle: epTitle,
      currentTime: 0,
      duration: 0,
      progressPercent: 0,
      updatedAt: Date.now(),
    });
  }, [
    currentIndex,
    hash,
    streamUrl,
    parsedEpisodes,
    mediaId,
    mediaType,
    rawTitle,
    poster,
    paramSeason,
    paramEpisode,
  ]);

  if (!hash) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <Film className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white">Видеопоток не найден</h2>
        <p className="text-sm text-zinc-400 mt-2">
          В URL отсутствуют параметры торрент-хэша для воспроизведения.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm shadow-glow-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Вернуться на главную
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-20">
      {/* Top Cinema Navbar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between border-b border-white/5">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Назад
        </button>

        <div className="text-center truncate px-4">
          <h1 className="text-sm sm:text-base font-bold text-white truncate max-w-lg">
            {rawTitle}
          </h1>
          <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5 mt-0.5">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            {currentEpisodeInfo
              ? `Сезон ${currentEpisodeInfo.season} • Серия ${currentEpisodeInfo.episode}: ${currentEpisodeInfo.title}`
              : `Файл #${currentIndex} в раздаче`}
          </p>
        </div>

        {/* Top Controls: Mode Switcher, VLC Helpers & Favorite Button */}
        <div className="flex flex-wrap items-center gap-2">
          {mediaId && (
            <FavoriteButton
              item={{
                id: parseInt(mediaId, 10),
                mediaType: (mediaType as 'movie' | 'tv') || 'tv',
                title: rawTitle,
                poster_path: poster || null,
                backdrop_path: null,
                vote_average: 0,
              }}
              showLabel={false}
              className="p-1.5"
            />
          )}

          {/* Mode Switcher: Direct P2P vs MP4 Remux */}
          <div className="flex items-center rounded-lg bg-surface border border-white/10 p-0.5 text-xs">
            <button
              onClick={() => setIsRemux(false)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                !isRemux ? 'bg-primary text-white shadow-glow-primary' : 'text-zinc-400 hover:text-white'
              }`}
              title="Прямой поток из торрента"
            >
              Прямой
            </button>
            <button
              onClick={() => setIsRemux(true)}
              className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors ${
                isRemux ? 'bg-primary text-white shadow-glow-primary' : 'text-zinc-400 hover:text-white'
              }`}
              title="Режим MP4 совместимости (для MKV/AC3)"
            >
              <Sparkles className="w-3 h-3" /> MP4 Ремукс
            </button>
          </div>

          {/* Download M3U for VLC */}
          <a
            href={`/api/stream/playlist?link=${encodeURIComponent(hash)}&index=${currentIndex}&title=${encodeURIComponent(rawTitle)}`}
            download
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium border bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 flex items-center gap-1 transition-colors"
            title="Скачать .m3u плейлист для VLC"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">VLC .m3u</span>
          </a>
        </div>
      </div>

      {/* Main Video Arena */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {/* Video Player */}
        <div className="w-full">
          <VideoPlayer
            streamUrl={streamUrl}
            hash={hash}
            fileIndex={currentIndex}
            title={rawTitle}
            poster={poster}
            initialTime={initialTime}
            isRemux={isRemux}
            onToggleRemux={() => setIsRemux(!isRemux)}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => {
              if (nextEpisode) {
                setCurrentIndex(nextEpisode.id);
              }
            }}
          />
        </div>

        {/* Next / Previous Quick Controls Bar */}
        {parsedEpisodes.length > 1 && (
          <div className="mt-4 p-3 rounded-xl bg-surface border border-white/10 flex items-center justify-between gap-4">
            <button
              onClick={() => prevEpisode && setCurrentIndex(prevEpisode.id)}
              disabled={!prevEpisode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              Предыдущая серия
            </button>

            <div className="text-center text-xs font-semibold text-zinc-200 truncate">
              {currentEpisodeInfo ? (
                <span>
                  Сезон {currentEpisodeInfo.season}, Серия {currentEpisodeInfo.episode}:{' '}
                  <span className="text-primary">{currentEpisodeInfo.title}</span>
                </span>
              ) : (
                <span>Файл #{currentIndex}</span>
              )}
            </div>

            <button
              onClick={() => nextEpisode && setCurrentIndex(nextEpisode.id)}
              disabled={!nextEpisode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-glow-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Следующая серия
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Season & Episode Selector Navigation Panel */}
        {parsedEpisodes.length > 1 && (
          <div className="mt-8 p-6 rounded-2xl bg-surface border border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tv className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-white">Выбор сезона и серии</h3>
              </div>
              <span className="text-xs text-zinc-400">
                Всего серий в раздаче: <b className="text-white">{parsedEpisodes.length}</b>
              </span>
            </div>

            {/* Season Tabs (e.g. Сезон 1, Сезон 2 ... Сезон 15) */}
            {availableSeasons.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {availableSeasons.map((s) => (
                  <button
                    key={s}
                    onClick={() => setActiveSeason(s)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      activeSeason === s
                        ? 'bg-primary text-white shadow-glow-primary scale-105'
                        : 'bg-cinema-card border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Сезон {s}
                  </button>
                ))}
              </div>
            )}

            {/* Episode Grid for active season */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto pr-1">
              {(seasonsMap.get(activeSeason) || parsedEpisodes).map((ep) => {
                const isPlaying = ep.id === currentIndex;
                return (
                  <button
                    key={ep.id}
                    onClick={() => setCurrentIndex(ep.id)}
                    className={`p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
                      isPlaying
                        ? 'bg-primary/20 border-primary shadow-glow-primary text-white'
                        : 'bg-cinema-card border-white/5 text-zinc-300 hover:border-white/20 hover:bg-white/5'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-xs ${
                        isPlaying ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {isPlaying ? <Play className="w-4 h-4 fill-white ml-0.5" /> : ep.episode}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold truncate leading-tight">
                          {ep.title}
                        </span>
                        {isPlaying && (
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                            Играет
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-1">
                        <span>Серия #{ep.episode}</span>
                        <span>•</span>
                        <span>{ep.formattedSize}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Streaming Hints & Tips */}
        <div className="mt-6 p-4 rounded-xl bg-surface/50 border border-white/5 text-xs text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span>
              Поток читается последовательно без записи на диск. При переключении серии плеер мгновенно подхватывает новый файл.
            </span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Горячие клавиши: <kbd className="px-1.5 py-0.5 rounded bg-zinc-800">Пробел</kbd> пауза,{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800">← / →</kbd> 5 сек,{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800">F</kbd> на весь экран
          </div>
        </div>
      </div>
    </div>
  );
}
