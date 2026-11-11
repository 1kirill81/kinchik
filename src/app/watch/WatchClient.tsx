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
  Volume2,
  ChevronDown,
  Languages,
  Captions,
  CaptionsOff,
  Upload,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  TorrServerFile,
  TorrServerTorrent,
  ParsedEpisodeFile,
  AudioTrackInfo,
  SubtitleTrackOption,
} from '@/types/torrent';
import { formatBytes, decodeSubtitleBytes, pickPreferredSubtitleTrack } from '@/lib/utils';
import { isVideoFile, isSampleFile, isSubtitleFile, getSubtitleFormat } from '@/lib/torrserver';
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

function inferSubtitleLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (/(?:^|[\s._\-[])(rus|ru|russian)(?:$|[\s._\-\]])/i.test(lower) || /[а-яё]/i.test(path)) {
    return 'RUS';
  }
  if (/(?:^|[\s._\-[])(eng|en|english)(?:$|[\s._\-\]])/i.test(lower)) {
    return 'ENG';
  }
  if (/(?:^|[\s._\-[])(ukr|uk|ukrainian)(?:$|[\s._\-\]])/i.test(lower)) {
    return 'UKR';
  }
  return 'SUB';
}

function getFileStem(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() || filePath;
  return base.replace(/\.[^/.]+$/, '').toLowerCase();
}

function buildTorrentSubtitleTracks(
  rawFiles: TorrServerFile[],
  hash: string,
  currentIndex: number,
  currentEpisodeInfo: ParsedEpisodeFile | null,
  isSeriesPack: boolean
): SubtitleTrackOption[] {
  const subFiles = rawFiles.filter((f) => isSubtitleFile(f.path));
  if (subFiles.length === 0) return [];

  const activeVideoFile = rawFiles.find((f) => f.id === currentIndex);
  const videoStem = activeVideoFile ? getFileStem(activeVideoFile.path) : '';

  const scored = subFiles.map((file) => {
    const subStem = getFileStem(file.path);
    const stemMatch =
      Boolean(videoStem) && (subStem === videoStem || subStem.startsWith(videoStem));
    const parsed = parseEpisodeFromFile(file);
    const epMatch =
      Boolean(currentEpisodeInfo) &&
      parsed.season === currentEpisodeInfo!.season &&
      parsed.episode === currentEpisodeInfo!.episode;

    return {
      file,
      score: stemMatch ? 2 : epMatch ? 1 : 0,
    };
  });

  const matched = scored.filter((item) => item.score > 0);
  const selected =
    isSeriesPack && matched.length > 0
      ? matched.sort((a, b) => b.score - a.score)
      : scored.sort((a, b) => b.score - a.score).slice(0, 20);

  return selected.map(({ file }) => {
    const baseName = file.path.split(/[/\\]/).pop() || file.path;
    const lang = inferSubtitleLanguage(file.path);
    const shortName = baseName.length > 36 ? baseName.slice(0, 33) + '...' : baseName;

    return {
      id: `torrent-${file.id}`,
      label: `${lang} • ${shortName}`,
      language: lang,
      url: `/api/subtitles/fetch?hash=${encodeURIComponent(hash)}&index=${file.id}&title=${encodeURIComponent(baseName)}`,
      format: getSubtitleFormat(file.path),
      source: 'torrent',
      fileName: baseName,
    };
  });
}

export default function WatchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const hash = searchParams.get('hash') || '';
  const initialIndex = parseInt(searchParams.get('index') || '1', 10);
  const rawTitle = searchParams.get('title') || 'Видеопоток';
  const initialRemux = searchParams.get('remux') === '1';
  const initialStreamUrl = initialRemux
    ? `/api/stream/remux?link=${hash}&index=${initialIndex}&title=${encodeURIComponent(rawTitle)}`
    : searchParams.get('streamUrl') || '';
  const poster = searchParams.get('poster') || '';
  const mediaId = searchParams.get('mediaId') || '';
  const mediaType = searchParams.get('mediaType') || '';

  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex);
  const [streamUrl, setStreamUrl] = useState<string>(initialStreamUrl);
  const [torrentData, setTorrentData] = useState<TorrServerTorrent | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [isRemux, setIsRemux] = useState(initialRemux);
  const [copiedTop, setCopiedTop] = useState(false);

  // Media probe info (real duration & embedded audio tracks)
  const [mediaDuration, setMediaDuration] = useState<number>(0);
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | null>(null);
  const [activeRemuxAudio, setActiveRemuxAudio] = useState<number | null>(null);
  const [remuxStartTime, setRemuxStartTime] = useState<number>(0);
  const [isAudioMenuOpen, setIsAudioMenuOpen] = useState(false);
  const audioMenuRef = useRef<HTMLDivElement>(null);
  const latestPlaybackTimeRef = useRef<number>(0);

  // Subtitles state (torrent external files + online OpenSubtitles + local file upload)
  const [onlineSubtitles, setOnlineSubtitles] = useState<SubtitleTrackOption[]>([]);
  const [localSubtitles, setLocalSubtitles] = useState<SubtitleTrackOption[]>([]);
  const [activeSubtitleId, setActiveSubtitleId] = useState<string | null>(null);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);
  const [isSubMenuOpen, setIsSubMenuOpen] = useState(false);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const lastSelectedSubtitleIdRef = useRef<string | null>(null);
  const localBlobUrlsRef = useRef<string[]>([]);

  // Active season tab for series
  const [activeSeason, setActiveSeason] = useState<number>(1);

  // Close audio and subtitle dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target as Node)) {
        setIsAudioMenuOpen(false);
      }
      if (subMenuRef.current && !subMenuRef.current.contains(e.target as Node)) {
        setIsSubMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      localBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

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

  // Probe full duration & audio tracks for the currently playing file
  useEffect(() => {
    if (!hash) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    setMediaDuration(0);
    setAudioTracks([]);
    setSelectedAudioIndex(null);
    setActiveRemuxAudio(null);
    setRemuxStartTime(0);
    latestPlaybackTimeRef.current = 0;

    async function fetchMediaInfo(attempt = 1) {
      try {
        const res = await fetch(
          `/api/stream/info?link=${encodeURIComponent(hash)}&index=${currentIndex}&title=${encodeURIComponent(rawTitle)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.success) {
          if (data.duration > 0) {
            setMediaDuration(data.duration);
          }
          if (Array.isArray(data.audioTracks) && data.audioTracks.length > 0) {
            setAudioTracks(data.audioTracks);
            setSelectedAudioIndex((prev) => (prev !== null ? prev : data.defaultAudioIndex));
          }

          if (attempt === 1 && !data.duration && (!data.audioTracks || data.audioTracks.length === 0)) {
            retryTimer = setTimeout(() => fetchMediaInfo(2), 4000);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch stream probe info:', err);
      }
    }

    fetchMediaInfo(1);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [hash, currentIndex, rawTitle]);

  // Update stream URL if index, proxy, remux, or audio track changes
  useEffect(() => {
    if (!hash) return;

    if (isRemux) {
      const params = new URLSearchParams({
        link: hash,
        index: currentIndex.toString(),
        title: rawTitle,
      });
      if (remuxStartTime > 0) {
        params.set('startTime', Math.floor(remuxStartTime).toString());
      }
      if (activeRemuxAudio !== null) {
        params.set('audio', activeRemuxAudio.toString());
      }
      setStreamUrl(`/api/stream/remux?${params.toString()}`);
      return;
    }

    const publicHost = (process.env.NEXT_PUBLIC_TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');
    let url = `${publicHost}/stream/${encodeURIComponent(rawTitle)}?link=${hash}&index=${currentIndex}&play`;

    if (useProxy) {
      url = `/api/stream/proxy?link=${hash}&index=${currentIndex}&title=${encodeURIComponent(rawTitle)}`;
    }

    setStreamUrl(url);
  }, [hash, currentIndex, rawTitle, useProxy, isRemux, remuxStartTime, activeRemuxAudio]);

  const handleToggleRemuxMode = (enableRemux: boolean) => {
    const resumeAt = Math.floor(latestPlaybackTimeRef.current || 0);
    if (enableRemux) {
      setRemuxStartTime(resumeAt);
      setIsRemux(true);
    } else {
      setIsRemux(false);
    }
  };

  const handleSelectAudioTrack = (streamIndex: number) => {
    const resumeAt = Math.floor(latestPlaybackTimeRef.current || 0);
    setSelectedAudioIndex(streamIndex);
    setActiveRemuxAudio(streamIndex);
    setRemuxStartTime(resumeAt);
    // Browser native <video> cannot switch embedded MKV audio tracks; switch to Remux at current position
    setIsRemux(true);
    setIsAudioMenuOpen(false);
  };

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

  const seasonForSub =
    currentEpisodeInfo?.season || (paramSeason ? parseInt(paramSeason, 10) : undefined);
  const episodeForSub =
    currentEpisodeInfo?.episode || (paramEpisode ? parseInt(paramEpisode, 10) : undefined);

  // Clear non-local subtitle track when switching to another episode/file
  useEffect(() => {
    setActiveSubtitleId((prev) => (prev?.startsWith('local-') ? prev : null));
  }, [hash, currentIndex]);

  // Fetch matching online subtitles via TMDB IMDb ID -> OpenSubtitles
  useEffect(() => {
    if (!hash) return;

    let cancelled = false;
    setIsLoadingSubtitles(true);

    const params = new URLSearchParams();
    if (mediaId) params.set('mediaId', mediaId);
    if (mediaType) params.set('mediaType', mediaType);
    if (rawTitle) params.set('title', rawTitle);
    if (seasonForSub) params.set('season', String(seasonForSub));
    if (episodeForSub) params.set('episode', String(episodeForSub));

    fetch(`/api/subtitles/search?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.subtitles)) {
          setOnlineSubtitles(data.subtitles);
        }
      })
      .catch((err) => console.warn('Subtitle search error:', err))
      .finally(() => {
        if (!cancelled) setIsLoadingSubtitles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hash, currentIndex, mediaId, mediaType, rawTitle, seasonForSub, episodeForSub]);

  const torrentSubtitles = useMemo(
    () =>
      buildTorrentSubtitleTracks(
        torrentData?.file_stats || [],
        hash,
        currentIndex,
        currentEpisodeInfo,
        parsedEpisodes.length > 1
      ),
    [torrentData, hash, currentIndex, currentEpisodeInfo, parsedEpisodes.length]
  );

  const allSubtitleTracks = useMemo<SubtitleTrackOption[]>(
    () => [...localSubtitles, ...torrentSubtitles, ...onlineSubtitles],
    [localSubtitles, torrentSubtitles, onlineSubtitles]
  );

  const activeSubtitleTrack = useMemo(
    () => allSubtitleTracks.find((t) => t.id === activeSubtitleId) || null,
    [allSubtitleTracks, activeSubtitleId]
  );

  const handleSelectSubtitle = (subtitleId: string | null) => {
    if (subtitleId) {
      lastSelectedSubtitleIdRef.current = subtitleId;
    }
    setActiveSubtitleId(subtitleId);
    setIsSubMenuOpen(false);
  };

  const handleQuickToggleSubtitles = () => {
    if (activeSubtitleId) {
      lastSelectedSubtitleIdRef.current = activeSubtitleId;
      setActiveSubtitleId(null);
      return;
    }

    const preferred = pickPreferredSubtitleTrack(
      allSubtitleTracks,
      lastSelectedSubtitleIdRef.current
    );

    if (preferred) {
      lastSelectedSubtitleIdRef.current = preferred.id;
      setActiveSubtitleId(preferred.id);
    } else {
      setIsSubMenuOpen(true);
    }
  };

  const handleLocalSubtitleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const decoded = decodeSubtitleBytes(bytes);

      const blobUrl = URL.createObjectURL(new Blob([decoded], { type: 'text/plain;charset=utf-8' }));
      localBlobUrlsRef.current.push(blobUrl);

      const newId = `local-${Date.now()}`;
      const newTrack: SubtitleTrackOption = {
        id: newId,
        label: `Файл • ${file.name}`,
        language: inferSubtitleLanguage(file.name),
        url: blobUrl,
        format: getSubtitleFormat(file.name),
        source: 'local',
        fileName: file.name,
      };

      setLocalSubtitles((prev) => [newTrack, ...prev]);
      lastSelectedSubtitleIdRef.current = newId;
      setActiveSubtitleId(newId);
      setIsSubMenuOpen(false);
    } catch (err) {
      console.error('Failed to read local subtitle file:', err);
    }
  };

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
  const lastInitializedFileRef = useRef<string>('');

  const handleTimeUpdate = (currentTime: number, duration: number) => {
    latestPlaybackTimeRef.current = currentTime;

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

  // Immediate save only when switching to a genuinely new episode/file
  useEffect(() => {
    if (!hash || !streamUrl) return;
    const fileKey = `${hash}:${currentIndex}`;
    if (lastInitializedFileRef.current === fileKey) return;
    lastInitializedFileRef.current = fileKey;

    if (savedProgress && savedProgress.fileIndex === currentIndex && savedProgress.currentTime > 5) {
      return;
    }

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
    savedProgress,
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

  const activeAudioTrack =
    audioTracks.find((t) => t.index === selectedAudioIndex) || audioTracks[0] || null;

  return (
    <div className="min-h-screen bg-black text-zinc-100 pb-16 sm:pb-20">
      {/* Top Cinema Navbar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 lg:gap-3 border-b border-white/5">
        <div className="flex items-center justify-between gap-2 w-full lg:w-auto lg:flex-1 min-w-0">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-surface border border-white/10 text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Назад</span>
          </button>

          <div className="text-center truncate px-2 flex-1 min-w-0">
            <h1 className="text-xs sm:text-base font-bold text-white truncate max-w-lg mx-auto">
              {rawTitle}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 flex items-center justify-center gap-1.5 mt-0.5 truncate">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse flex-shrink-0" />
              <span className="truncate">
                {currentEpisodeInfo
                  ? `Сезон ${currentEpisodeInfo.season} • Серия ${currentEpisodeInfo.episode}: ${currentEpisodeInfo.title}`
                  : `Файл #${currentIndex} в раздаче`}
              </span>
            </p>
          </div>

          {mediaId ? (
            <div className="lg:hidden flex-shrink-0">
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
            </div>
          ) : (
            <div className="w-8 lg:hidden" />
          )}
        </div>

        {/* Top Controls: Audio Track, Mode Switcher, VLC Helpers & Favorite Button */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full lg:w-auto">
          {mediaId && (
            <div className="hidden lg:block">
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
            </div>
          )}

          {/* Audio Track / Voiceover Switcher */}
          {audioTracks.length > 0 && (
            <div ref={audioMenuRef} className="relative">
              <button
                onClick={() => setIsAudioMenuOpen(!isAudioMenuOpen)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-white/10 border border-white/10 text-[11px] sm:text-xs font-medium text-zinc-200 transition-colors max-w-[165px] sm:max-w-[210px]"
                title="Сменить озвучку / аудиодорожку"
              >
                <Languages className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="truncate">
                  {activeAudioTrack ? activeAudioTrack.label : 'Озвучка'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 flex-shrink-0 transition-transform ${isAudioMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAudioMenuOpen && (
                <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[min(18rem,calc(100vw-1.5rem))] bg-zinc-950/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-white/5">
                  <div className="px-3 py-2 bg-white/5 flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-primary" /> Выбор озвучки ({audioTracks.length})
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                    {audioTracks.map((track) => {
                      const isActive = track.index === (selectedAudioIndex ?? audioTracks[0]?.index);
                      return (
                        <button
                          key={track.index}
                          onClick={() => handleSelectAudioTrack(track.index)}
                          className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 transition-colors ${
                            isActive
                              ? 'bg-primary/20 text-white font-semibold'
                              : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span className="truncate">{track.label}</span>
                          {isActive && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  {audioTracks.length === 1 && (
                    <div className="px-3 py-2 text-[10px] text-zinc-500 bg-black/40">
                      В этом торрент-файле только 1 дорожка. Другую озвучку можно выбрать в списке раздач.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Subtitles ON/OFF Toggle & Track Switcher */}
          <div ref={subMenuRef} className="relative">
            <div className="inline-flex items-center rounded-lg bg-surface border border-white/10 text-[11px] sm:text-xs font-medium">
              <button
                onClick={handleQuickToggleSubtitles}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg transition-colors max-w-[140px] sm:max-w-[180px] ${
                  activeSubtitleTrack
                    ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
                title={
                  activeSubtitleTrack
                    ? `Выключить субтитры (${activeSubtitleTrack.label})`
                    : 'Включить субтитры'
                }
              >
                {activeSubtitleTrack ? (
                  <Captions className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                ) : (
                  <CaptionsOff className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                )}
                <span className="truncate">
                  {activeSubtitleTrack ? `Суб: ${activeSubtitleTrack.language}` : 'Субтитры'}
                </span>
              </button>
              <button
                onClick={() => setIsSubMenuOpen(!isSubMenuOpen)}
                className="px-1.5 py-1.5 rounded-r-lg border-l border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Выбрать файл субтитров"
                aria-label="Выбрать субтитры"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${isSubMenuOpen ? 'rotate-180' : ''}`}
                />
              </button>
            </div>

            {isSubMenuOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[min(19.5rem,calc(100vw-1.5rem))] bg-zinc-950/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-white/5">
                <div className="px-3 py-2 bg-white/5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                    <Captions className="w-3.5 h-3.5 text-amber-400" /> Субтитры ({allSubtitleTracks.length})
                  </span>
                  <label className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-[10px] font-semibold text-zinc-200 cursor-pointer transition-colors">
                    <Upload className="w-3 h-3" />
                    Загрузить .srt
                    <input
                      type="file"
                      accept=".srt,.vtt,.ass,.ssa"
                      onChange={handleLocalSubtitleUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                  <button
                    onClick={() => handleSelectSubtitle(null)}
                    className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 transition-colors ${
                      !activeSubtitleId
                        ? 'bg-primary/20 text-white font-semibold'
                        : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <CaptionsOff className="w-3.5 h-3.5 text-zinc-400" />
                      Выкл (Без субтитров)
                    </span>
                    {!activeSubtitleId && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                  </button>

                  {allSubtitleTracks.map((track) => {
                    const isActive = track.id === activeSubtitleId;
                    const sourceBadge =
                      track.source === 'torrent'
                        ? 'Раздача'
                        : track.source === 'local'
                          ? 'Файл'
                          : 'Online';
                    return (
                      <button
                        key={track.id}
                        onClick={() => handleSelectSubtitle(track.id)}
                        className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between gap-2 transition-colors ${
                          isActive
                            ? 'bg-amber-500/20 text-white font-semibold'
                            : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-zinc-300 flex-shrink-0">
                            {sourceBadge}
                          </span>
                          <span className="truncate">{track.label}</span>
                        </div>
                        {isActive && <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      </button>
                    );
                  })}

                  {isLoadingSubtitles && (
                    <div className="px-3 py-2.5 text-[11px] text-zinc-400 flex items-center gap-2">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Поиск онлайн-субтитров...
                    </div>
                  )}

                  {!isLoadingSubtitles && allSubtitleTracks.length === 0 && (
                    <div className="px-3 py-3 text-[11px] text-zinc-500">
                      Внешние субтитры не найдены. Вы можете загрузить файл .srt / .vtt / .ass кнопкой выше.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Mode Switcher: Direct P2P vs MP4 Remux */}
          <div className="flex items-center rounded-lg bg-surface border border-white/10 p-0.5 text-[11px] sm:text-xs ml-auto sm:ml-0">
            <button
              onClick={() => handleToggleRemuxMode(false)}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                !isRemux ? 'bg-primary text-white shadow-glow-primary' : 'text-zinc-400 hover:text-white'
              }`}
              title="Прямой поток из торрента"
            >
              Прямой
            </button>
            <button
              onClick={() => handleToggleRemuxMode(true)}
              className={`px-2 sm:px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
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
            className="px-2 sm:px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium border bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10 flex items-center gap-1 transition-colors flex-shrink-0"
            title="Скачать .m3u плейлист для VLC"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">VLC .m3u</span>
          </a>
        </div>
      </div>

      {/* Main Video Arena */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-3 sm:pt-4">
        {/* Video Player */}
        <div className="w-full">
          <VideoPlayer
            streamUrl={streamUrl}
            hash={hash}
            fileIndex={currentIndex}
            title={rawTitle}
            poster={poster}
            subtitleTracks={allSubtitleTracks}
            activeSubtitleId={activeSubtitleId}
            onSelectSubtitle={handleSelectSubtitle}
            initialTime={initialTime}
            remuxStartTime={remuxStartTime}
            externalDuration={mediaDuration}
            audioTracks={audioTracks}
            selectedAudioIndex={selectedAudioIndex}
            onSelectAudioTrack={handleSelectAudioTrack}
            isRemux={isRemux}
            onToggleRemux={() => handleToggleRemuxMode(!isRemux)}
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
          <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 rounded-xl bg-surface border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
            <div className="text-center text-xs font-semibold text-zinc-200 truncate sm:order-2 px-1">
              {currentEpisodeInfo ? (
                <span>
                  Сезон {currentEpisodeInfo.season}, Серия {currentEpisodeInfo.episode}:{' '}
                  <span className="text-primary">{currentEpisodeInfo.title}</span>
                </span>
              ) : (
                <span>Файл #{currentIndex}</span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:contents gap-2">
              <button
                onClick={() => prevEpisode && setCurrentIndex(prevEpisode.id)}
                disabled={!prevEpisode}
                className="sm:order-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">Предыдущая</span>
              </button>

              <button
                onClick={() => nextEpisode && setCurrentIndex(nextEpisode.id)}
                disabled={!nextEpisode}
                className="sm:order-3 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-glow-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="truncate">Следующая</span>
                <ChevronRight className="w-4 h-4 flex-shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Season & Episode Selector Navigation Panel */}
        {parsedEpisodes.length > 1 && (
          <div className="mt-5 sm:mt-8 p-4 sm:p-6 rounded-2xl bg-surface border border-white/10 space-y-4 sm:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tv className="w-5 h-5 text-primary" />
                <h3 className="text-sm sm:text-base font-bold text-white">Выбор сезона и серии</h3>
              </div>
              <span className="text-xs text-zinc-400">
                Всего серий: <b className="text-white">{parsedEpisodes.length}</b>
              </span>
            </div>

            {/* Season Tabs (e.g. Сезон 1, Сезон 2 ... Сезон 15) */}
            {availableSeasons.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-0.5 scrollbar-none">
                {availableSeasons.map((s) => (
                  <button
                    key={s}
                    onClick={() => setActiveSeason(s)}
                    className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all ${
                      activeSeason === s
                        ? 'bg-primary text-white shadow-glow-primary'
                        : 'bg-cinema-card border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    Сезон {s}
                  </button>
                ))}
              </div>
            )}

            {/* Episode Grid for active season */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 max-h-96 overflow-y-auto pr-1">
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
                          <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-0.5 flex-shrink-0">
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
        <div className="mt-5 sm:mt-6 p-3.5 sm:p-4 rounded-xl bg-surface/50 border border-white/5 text-xs text-zinc-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2">
            <Radio className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Поток читается последовательно без записи на диск. При переключении серии плеер мгновенно подхватывает новый файл.
            </span>
          </div>
          <div className="text-[11px] text-zinc-500 hidden md:block flex-shrink-0">
            Горячие клавиши: <kbd className="px-1.5 py-0.5 rounded bg-zinc-800">Пробел</kbd> пауза,{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800">← / →</kbd> 5 сек,{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-zinc-800">F</kbd> на весь экран
          </div>
        </div>
      </div>
    </div>
  );
}
