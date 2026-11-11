'use client';

import React, { useEffect, useRef, useState } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import {
  Download,
  Users,
  Activity,
  Maximize2,
  RefreshCw,
  AlertCircle,
  Wifi,
  ExternalLink,
  Play,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { TorrServerLiveStats } from '@/types/torrent';

const ruI18n = {
  'Video Load Failed': 'Ошибка загрузки видео',
  Volume: 'Громкость',
  Play: 'Воспроизведение',
  Pause: 'Пауза',
  Rate: 'Скорость',
  Mute: 'Без звука',
  Reconnect: 'Переподключение',
  Screenshot: 'Скриншот',
  'Play Speed': 'Скорость',
  'Aspect Ratio': 'Соотношение сторон',
  Default: 'По умолчанию',
  Normal: 'Обычная',
  Subtitle: 'Субтитры',
  Audio: 'Аудио',
};

interface VideoPlayerProps {
  streamUrl: string;
  hash: string;
  fileIndex?: number;
  title: string;
  poster?: string;
  subtitles?: { url: string; label: string; default?: boolean }[];
  initialTime?: number;
  isRemux?: boolean;
  onToggleRemux?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
}

export default function VideoPlayer({
  streamUrl,
  hash,
  fileIndex = 1,
  title,
  poster,
  subtitles = [],
  initialTime = 0,
  isRemux = false,
  onToggleRemux,
  onTimeUpdate,
  onEnded,
}: VideoPlayerProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const playerInstance = useRef<Artplayer | null>(null);
  const hasSeekedRef = useRef<boolean>(false);
  const [copied, setCopied] = useState(false);

  // Live stats from TorrServer
  const [stats, setStats] = useState<TorrServerLiveStats | null>(null);
  const [isBuffering, setIsBuffering] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Poll TorrServer live stats
  useEffect(() => {
    if (!hash) return;

    let isMounted = true;

    const fetchStats = async () => {
      try {
        const res = await fetch(`/api/stream/stats?hash=${encodeURIComponent(hash)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success && isMounted) {
          setStats(data.stats);
          if (data.stats.isReady) {
            setIsBuffering(false);
          }
        }
      } catch (err: any) {
        // Stats polling is optional, ignore transient errors
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [hash]);

  // Initialize Artplayer safely
  useEffect(() => {
    if (typeof window === 'undefined' || !artRef.current) return;

    // Destroy existing instance if any
    if (playerInstance.current) {
      try {
        playerInstance.current.destroy(false);
      } catch (e) {
        // ignore cleanup error
      }
      playerInstance.current = null;
    }

    try {
      const artOptions: any = {
        container: artRef.current,
        url: streamUrl,
        poster: poster || '',
        volume: 0.8,
        isLive: false,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: true,
        screenshot: true,
        setting: true,
        loop: false,
        flip: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: true,
        airplay: true,
        theme: '#e50914',
        hotkey: true,
        i18n: {
          'ru-ru': ruI18n,
        },
        lang: 'ru-ru',
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string, artInstance: any) {
            if (Hls.isSupported()) {
              const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
              });
              hls.loadSource(url);
              hls.attachMedia(video);
              artInstance.hls = hls;
              artInstance.on('destroy', () => hls.destroy());
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = url;
            } else {
              artInstance.notice.show = 'Формат HLS не поддерживается вашим браузером';
            }
          },
        },
      };

      if (subtitles && subtitles.length > 0) {
        artOptions.subtitle = {
          url: subtitles[0].url,
          type: 'vtt',
          style: {
            color: '#ffffff',
            fontSize: '22px',
            textShadow: '0 2px 4px rgba(0,0,0,0.9)',
          },
          encoding: 'utf-8',
        };
      }

      hasSeekedRef.current = false;
      const art = new Artplayer(artOptions);

      const handleSeekInitial = () => {
        if (initialTime && initialTime > 5 && !hasSeekedRef.current) {
          try {
            art.currentTime = initialTime;
            hasSeekedRef.current = true;
          } catch (e) {}
        }
      };

      art.on('video:loadedmetadata', () => {
        handleSeekInitial();
      });

      art.on('video:canplay', () => {
        setIsBuffering(false);
        handleSeekInitial();
      });

      art.on('video:waiting', () => {
        setIsBuffering(true);
      });

      art.on('video:playing', () => {
        setIsBuffering(false);
      });

      art.on('video:timeupdate', () => {
        if (onTimeUpdate && art.duration > 0) {
          onTimeUpdate(art.currentTime, art.duration);
        }
      });

      art.on('video:error', () => {
        setPlayerError('Ошибка декодирования видео в браузере. Возможно, данный кодек не поддерживается вашим браузером.');
      });

      art.on('video:ended', () => {
        if (onEnded) onEnded();
      });

      playerInstance.current = art;
      setPlayerError(null);
    } catch (err: any) {
      console.error('Artplayer init error:', err);
      setPlayerError(err.message || 'Не удалось инициализировать видеоплеер');
    }

    return () => {
      if (playerInstance.current) {
        try {
          playerInstance.current.destroy(false);
        } catch (e) {}
        playerInstance.current = null;
      }
    };
  }, [streamUrl, poster, isRemux]);

  const handleCopyLink = () => {
    const cleanTitle = encodeURIComponent(title.replace(/[\\/:*?"<>|]/g, ''));
    const publicHost = (process.env.NEXT_PUBLIC_TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');
    const url = `${publicHost}/stream/${cleanTitle}?link=${hash}&index=${fileIndex}&play`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl group">
      {/* Fallback Error Display */}
      {playerError ? (
        <div className="absolute inset-0 z-40 bg-zinc-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-bold text-white">Кодек не поддерживается браузером</h3>
            <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
              Раздача упакована в контейнер MKV или содержит аудиодорожку (AC3/EAC3/DTS), которую браузер не декодирует напрямую.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2 max-w-xl">
            {onToggleRemux && (
              <button
                onClick={() => {
                  setPlayerError(null);
                  onToggleRemux();
                }}
                className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-glow-primary transition-all transform hover:scale-105 active:scale-95"
              >
                <Sparkles className="w-4 h-4" /> Включить режим совместимости (MP4)
              </button>
            )}

            <a
              href={`/api/stream/playlist?link=${encodeURIComponent(hash)}&index=${fileIndex}&title=${encodeURIComponent(title)}`}
              download
              className="px-4 py-2.5 rounded-xl bg-surface hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-2 border border-white/10 transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-400" /> Скачать .m3u для VLC
            </a>

            <button
              onClick={handleCopyLink}
              className="px-4 py-2.5 rounded-xl bg-surface hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-2 border border-white/10 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
              {copied ? 'Ссылка скопирована!' : 'Скопировать для VLC / PotPlayer'}
            </button>

            <button
              onClick={() => {
                setPlayerError(null);
                window.location.reload();
              }}
              className="px-3 py-2 rounded-xl text-zinc-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Повторить
            </button>
          </div>
        </div>
      ) : null}

      {/* Video Container Mount */}
      <div ref={artRef} className="w-full h-full" />

      {/* Floating TorrServer Real-Time Stats HUD */}
      <div className="absolute top-4 left-4 z-30 pointer-events-none transition-opacity duration-300 opacity-90 group-hover:opacity-100">
        <div className="flex flex-wrap items-center gap-2 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-xs shadow-lg">
          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <Activity className="w-3.5 h-3.5" />
            <span>{stats?.status || 'Подключение к TorrServer...'}</span>
          </div>

          <span className="text-zinc-600">|</span>

          {/* Download Speed */}
          <div className="flex items-center gap-1 text-cyan-300 font-medium">
            <Download className="w-3.5 h-3.5" />
            <span>{stats?.formattedSpeed || '0 KB/s'}</span>
          </div>

          <span className="text-zinc-600">|</span>

          {/* Seeds / Peers */}
          <div className="flex items-center gap-1 text-zinc-300">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Сиды: <b className="text-white">{stats?.seeders ?? 0}</b> / Пиры:{' '}
              <b className="text-zinc-400">{stats?.activePeers ?? 0}</b>
            </span>
          </div>

          {/* Preload Progress if buffering */}
          {isBuffering && stats && stats.preloadProgress < 100 && (
            <>
              <span className="text-zinc-600">|</span>
              <div className="flex items-center gap-1.5 text-amber-300">
                <Wifi className="w-3.5 h-3.5 animate-pulse" />
                <span>Буфер: {stats.preloadProgress}%</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
