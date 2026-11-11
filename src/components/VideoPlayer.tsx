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
import { AudioTrackInfo, SubtitleTrackOption, TorrServerLiveStats } from '@/types/torrent';
import { pickPreferredSubtitleTrack } from '@/lib/utils';

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
  'Switch Subtitle': 'Субтитры',
  Audio: 'Аудио',
};

function parseVttTimeToSeconds(timestamp: string): number {
  const parts = timestamp.trim().replace(',', '.').split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  }
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

function formatSecondsToVttTime(seconds: number): string {
  const totalMs = Math.round(Math.max(0, seconds) * 1000);
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

/**
 * Shift WebVTT cue timestamps backwards when Remux playback starts at a non-zero -ss offset.
 */
function shiftVttTimestamps(vtt: string, offsetSeconds: number): string {
  if (!offsetSeconds || offsetSeconds <= 0) return vtt;

  const timingRegex =
    /^(\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3})(.*)$/;

  const blocks = vtt.split(/\r?\n\r?\n/);
  const shiftedBlocks: string[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/);
    const timingLineIdx = lines.findIndex((line) => timingRegex.test(line));
    if (timingLineIdx === -1) {
      shiftedBlocks.push(block);
      continue;
    }

    const match = lines[timingLineIdx].match(timingRegex);
    if (!match) {
      shiftedBlocks.push(block);
      continue;
    }

    const startSec = parseVttTimeToSeconds(match[1]) - offsetSeconds;
    const endSec = parseVttTimeToSeconds(match[2]) - offsetSeconds;
    if (endSec <= 0) continue;

    lines[timingLineIdx] = `${formatSecondsToVttTime(startSec)} --> ${formatSecondsToVttTime(endSec)}${match[3] || ''}`;
    shiftedBlocks.push(lines.join('\n'));
  }

  return shiftedBlocks.join('\n\n');
}

interface VideoPlayerProps {
  streamUrl: string;
  hash: string;
  fileIndex?: number;
  title: string;
  poster?: string;
  subtitleTracks?: SubtitleTrackOption[];
  activeSubtitleId?: string | null;
  onSelectSubtitle?: (subtitleId: string | null) => void;
  initialTime?: number;
  remuxStartTime?: number;
  externalDuration?: number;
  audioTracks?: AudioTrackInfo[];
  selectedAudioIndex?: number | null;
  onSelectAudioTrack?: (streamIndex: number) => void;
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
  subtitleTracks = [],
  activeSubtitleId = null,
  onSelectSubtitle,
  initialTime = 0,
  remuxStartTime = 0,
  externalDuration = 0,
  audioTracks = [],
  selectedAudioIndex = null,
  onSelectAudioTrack,
  isRemux = false,
  onToggleRemux,
  onTimeUpdate,
  onEnded,
}: VideoPlayerProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const playerInstance = useRef<Artplayer | null>(null);
  const hasSeekedRef = useRef<boolean>(false);
  const remuxOffsetRef = useRef<number>(remuxStartTime || 0);
  const remuxDurationRef = useRef<number>(externalDuration || 0);
  const pendingRemuxSeekRef = useRef<number | null>(null);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamUrlRef = useRef<string>(streamUrl);
  const onSelectAudioRef = useRef(onSelectAudioTrack);
  const subtitleTracksRef = useRef<SubtitleTrackOption[]>(subtitleTracks);
  const activeSubtitleIdRef = useRef<string | null>(activeSubtitleId);
  const onSelectSubtitleRef = useRef(onSelectSubtitle);
  const lastSubtitleIdRef = useRef<string | null>(activeSubtitleId);
  const appliedSubtitleKeyRef = useRef<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    streamUrlRef.current = streamUrl;
  }, [streamUrl]);

  useEffect(() => {
    onSelectAudioRef.current = onSelectAudioTrack;
  }, [onSelectAudioTrack]);

  useEffect(() => {
    subtitleTracksRef.current = subtitleTracks;
  }, [subtitleTracks]);

  useEffect(() => {
    activeSubtitleIdRef.current = activeSubtitleId;
    if (activeSubtitleId) {
      lastSubtitleIdRef.current = activeSubtitleId;
    }
  }, [activeSubtitleId]);

  useEffect(() => {
    onSelectSubtitleRef.current = onSelectSubtitle;
  }, [onSelectSubtitle]);

  const applySubtitleToArt = (
    art: Artplayer,
    track: SubtitleTrackOption | null,
    forceReload = false
  ) => {
    if (!track) {
      art.subtitle.show = false;
      return;
    }

    const offset = remuxOffsetRef.current || 0;
    const targetKey = `${track.url}|${offset}`;
    art.subtitle.show = true;

    if (!forceReload && appliedSubtitleKeyRef.current === targetKey) {
      return;
    }

    appliedSubtitleKeyRef.current = targetKey;
    art.subtitle
      .switch(track.url, {
        type: track.format,
        name: track.label,
        encoding: 'utf-8',
        onVttLoad: (vtt: string) => shiftVttTimestamps(vtt, remuxOffsetRef.current),
      })
      .catch((err) => {
        console.warn('Subtitle load error:', err);
        appliedSubtitleKeyRef.current = '';
        art.notice.show = 'Не удалось загрузить файл субтитров';
      });
  };

  const syncSubtitleUiOnArt = (
    art: Artplayer,
    tracks: SubtitleTrackOption[],
    activeId: string | null
  ) => {
    const activeTrack = tracks.find((t) => t.id === activeId) || null;
    const isActive = Boolean(activeTrack);

    try {
      art.controls.update({
        name: 'subtitle-toggle',
        position: 'right',
        index: 12,
        html: `<span style="display:inline-flex;align-items:center;justify-content:center;padding:2px 6px;border-radius:5px;font-size:11px;font-weight:700;letter-spacing:0.04em;border:1px solid ${
          isActive ? 'rgba(229,9,20,0.9)' : 'rgba(255,255,255,0.28)'
        };background:${isActive ? 'rgba(229,9,20,0.85)' : 'rgba(255,255,255,0.08)'};color:${
          isActive ? '#ffffff' : '#d4d4d8'
        };">${isActive ? 'CC ON' : 'CC'}</span>`,
        tooltip: isActive
          ? `Выключить субтитры (${activeTrack?.language || 'SUB'})`
          : 'Включить субтитры',
        click() {
          const currentId = activeSubtitleIdRef.current;
          if (currentId) {
            lastSubtitleIdRef.current = currentId;
            onSelectSubtitleRef.current?.(null);
            art.notice.show = 'Субтитры выключены';
            return;
          }

          const preferred = pickPreferredSubtitleTrack(
            subtitleTracksRef.current,
            lastSubtitleIdRef.current
          );

          if (preferred) {
            onSelectSubtitleRef.current?.(preferred.id);
            art.notice.show = `Субтитры: ${preferred.language}`;
          } else {
            art.notice.show = 'Субтитры не найдены — выберите файл в меню сверху';
          }
        },
      });
    } catch {}

    try {
      art.setting.update({
        name: 'subtitle-track',
        width: 280,
        html: 'Субтитры',
        tooltip: activeTrack ? activeTrack.language : 'Выкл',
        selector: [
          {
            default: !activeTrack,
            html: 'Выкл (Без субтитров)',
            value: '__off__',
          },
          ...tracks.map((track) => ({
            default: track.id === activeId,
            html: track.label,
            value: track.id,
          })),
        ],
        onSelect(item: any) {
          if (item.value === '__off__') {
            onSelectSubtitleRef.current?.(null);
          } else if (typeof item.value === 'string') {
            onSelectSubtitleRef.current?.(item.value);
          }
          return item.value === '__off__' ? 'Выкл' : item.html;
        },
      });
    } catch {}
  };

  // Sync external duration (from ffprobe / TMDB) into live Remux video proxy
  useEffect(() => {
    if (externalDuration && externalDuration > 0) {
      remuxDurationRef.current = externalDuration;
      const art = playerInstance.current;
      if (art) {
        art.emit('video:timeupdate');
        art.emit('video:progress');
      }
    }
  }, [externalDuration]);

  // Sync audio tracks into Artplayer Settings gear menu (works in fullscreen too)
  useEffect(() => {
    const art = playerInstance.current;
    if (!art || !audioTracks || audioTracks.length === 0) return;

    const currentTrack =
      audioTracks.find((t) => t.index === selectedAudioIndex) || audioTracks[0];

    try {
      art.setting.update({
        name: 'audio-track',
        width: 280,
        html: 'Озвучка',
        tooltip: currentTrack ? currentTrack.label : 'По умолчанию',
        selector: audioTracks.map((track) => ({
          default: track.index === (selectedAudioIndex ?? audioTracks[0]?.index),
          html: track.label,
          value: track.index,
        })),
        onSelect(item: any) {
          if (onSelectAudioRef.current && typeof item.value === 'number') {
            onSelectAudioRef.current(item.value);
          }
          return item.html;
        },
      });
    } catch (e) {
      // ignore if setting panel is unmounted
    }
  }, [audioTracks, selectedAudioIndex]);

  // Sync live subtitles list, active track & ON/OFF toggle into Artplayer
  useEffect(() => {
    const art = playerInstance.current;
    if (!art) return;

    syncSubtitleUiOnArt(art, subtitleTracks, activeSubtitleId);
    const activeTrack = subtitleTracks.find((t) => t.id === activeSubtitleId) || null;
    applySubtitleToArt(art, activeTrack);
  }, [subtitleTracks, activeSubtitleId]);

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

    // Reset seek offset & pending timers for the new stream instance
    remuxOffsetRef.current = isRemux ? (remuxStartTime || 0) : 0;
    remuxDurationRef.current = externalDuration || 0;
    pendingRemuxSeekRef.current = null;
    if (seekTimerRef.current) {
      clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
    }

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
        autoPlayback: false,
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

      // In Remux mode, fragmented MP4 over HTTP pipe has no duration header;
      // proxy the <video> element to expose full episode duration & server-side -ss seeking.
      if (isRemux) {
        artOptions.proxy = function () {
          const video = document.createElement('video');
          video.playsInline = true;
          const track = document.createElement('track');
          track.default = true;
          track.kind = 'metadata';
          track.src = '';
          video.appendChild(track);

          const nativeDurationDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'duration');
          const nativeCurrentTimeDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
          const nativeBufferedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'buffered');

          Object.defineProperty(video, 'duration', {
            configurable: true,
            get() {
              if (remuxDurationRef.current > 0) {
                return remuxDurationRef.current;
              }
              // Never show gradually ticking fragment duration in Remux mode before probe finishes
              return 0;
            },
          });

          Object.defineProperty(video, 'currentTime', {
            configurable: true,
            get() {
              if (pendingRemuxSeekRef.current !== null) {
                return pendingRemuxSeekRef.current;
              }
              const nativeTime = nativeCurrentTimeDesc?.get?.call(this) || 0;
              return remuxOffsetRef.current + nativeTime;
            },
            set(val: number) {
              const maxDur = remuxDurationRef.current || Infinity;
              const target = Math.max(0, Math.min(val, maxDur));
              const offset = remuxOffsetRef.current;
              const buf = nativeBufferedDesc?.get?.call(this);
              let maxNativeBuf = 0;
              if (buf && buf.length > 0) {
                maxNativeBuf = buf.end(buf.length - 1);
              }

              // Fast native seek if target is already inside current buffered chunk
              if (target >= offset && target <= offset + maxNativeBuf - 0.5) {
                hasSeekedRef.current = true;
                pendingRemuxSeekRef.current = null;
                if (seekTimerRef.current) {
                  clearTimeout(seekTimerRef.current);
                  seekTimerRef.current = null;
                }
                nativeCurrentTimeDesc?.set?.call(this, target - offset);
                return;
              }

              // Debounced server-side FFmpeg seek (-ss)
              hasSeekedRef.current = true;
              pendingRemuxSeekRef.current = target;
              if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
              seekTimerRef.current = setTimeout(() => {
                const finalTarget = Math.floor(target);
                pendingRemuxSeekRef.current = null;
                remuxOffsetRef.current = finalTarget;
                setIsBuffering(true);

                try {
                  const u = new URL(streamUrlRef.current, window.location.origin);
                  u.searchParams.set('startTime', finalTarget.toString());
                  video.src = u.pathname + u.search;
                  video.load();
                  video.play().catch(() => {});

                  // Resync active subtitle timestamps to match the new Remux start offset
                  const art = playerInstance.current;
                  const activeTrack =
                    subtitleTracksRef.current.find((t) => t.id === activeSubtitleIdRef.current) ||
                    null;
                  if (art && activeTrack) {
                    applySubtitleToArt(art, activeTrack, true);
                  }
                } catch (err) {
                  console.error('Remux seek error:', err);
                }
              }, 350);
            },
          });

          Object.defineProperty(video, 'buffered', {
            configurable: true,
            get() {
              const rawBuf = nativeBufferedDesc?.get?.call(this);
              const offset = remuxOffsetRef.current;
              return {
                get length() {
                  return rawBuf ? rawBuf.length : 0;
                },
                start(i: number) {
                  return (rawBuf ? rawBuf.start(i) : 0) + offset;
                },
                end(i: number) {
                  return (rawBuf ? rawBuf.end(i) : 0) + offset;
                },
              };
            },
          });

          return video;
        };
      }

      // Configure subtitle renderer cleanly; actual track loading runs right after mount
      artOptions.subtitle = {
        url: '',
        type: 'vtt',
        style: {
          color: '#ffffff',
          fontSize: '22px',
          textShadow: '0 2px 6px rgba(0,0,0,0.95)',
        },
        encoding: 'utf-8',
        onVttLoad: (vtt: string) => shiftVttTimestamps(vtt, remuxOffsetRef.current),
      };

      // Skip initial seek if Remux already started directly at remuxStartTime
      hasSeekedRef.current = isRemux && remuxStartTime > 0 && Math.abs(remuxStartTime - initialTime) <= 5;
      appliedSubtitleKeyRef.current = '';
      const art = new Artplayer(artOptions);

      // Keep Artplayer's $track bound to the proxied <video>'s live <track> in Remux mode
      if (isRemux) {
        const videoEl = art.template.$video as HTMLVideoElement | undefined;
        const innerTrack = videoEl?.querySelector('track') as HTMLTrackElement | null;
        if (innerTrack) {
          (art.template as any).$track = innerTrack;
        }
      }

      const initialSubTrack =
        subtitleTracksRef.current.find((t) => t.id === activeSubtitleIdRef.current) || null;
      syncSubtitleUiOnArt(art, subtitleTracksRef.current, activeSubtitleIdRef.current);
      applySubtitleToArt(art, initialSubTrack, true);

      if (audioTracks && audioTracks.length > 0) {
        const currentTrack =
          audioTracks.find((t) => t.index === selectedAudioIndex) || audioTracks[0];
        try {
          art.setting.update({
            name: 'audio-track',
            width: 280,
            html: 'Озвучка',
            tooltip: currentTrack ? currentTrack.label : 'По умолчанию',
            selector: audioTracks.map((track) => ({
              default: track.index === (selectedAudioIndex ?? audioTracks[0]?.index),
              html: track.label,
              value: track.index,
            })),
            onSelect(item: any) {
              if (onSelectAudioRef.current && typeof item.value === 'number') {
                onSelectAudioRef.current(item.value);
              }
              return item.html;
            },
          });
        } catch {}
      }

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
        if (pendingRemuxSeekRef.current === null && onTimeUpdate && art.duration > 0) {
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
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
      }
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
    <div className="relative w-full aspect-video min-h-[220px] rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl group">
      {/* Fallback Error Display (scrollable on short mobile landscape/portrait screens) */}
      {playerError ? (
        <div className="absolute inset-0 z-40 bg-zinc-950/95 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-6 text-center space-y-2.5 sm:space-y-4 overflow-y-auto">
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30 flex-shrink-0">
            <AlertCircle className="w-5 h-5 sm:w-7 sm:h-7" />
          </div>
          <div className="max-w-md px-1">
            <h3 className="text-sm sm:text-base font-bold text-white">Кодек не поддерживается браузером</h3>
            <p className="text-[11px] sm:text-xs text-zinc-400 mt-1 sm:mt-1.5 leading-relaxed">
              Раздача в MKV или содержит аудиодорожку (AC3/EAC3/DTS), которую браузер не декодирует напрямую.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 pt-1 sm:pt-2 max-w-xl">
            {onToggleRemux && (
              <button
                onClick={() => {
                  setPlayerError(null);
                  onToggleRemux();
                }}
                className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-[11px] sm:text-xs font-bold flex items-center gap-1.5 sm:gap-2 shadow-glow-primary transition-all transform hover:scale-105 active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Включить режим MP4
              </button>
            )}

            <a
              href={`/api/stream/playlist?link=${encodeURIComponent(hash)}&index=${fileIndex}&title=${encodeURIComponent(title)}`}
              download
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-surface hover:bg-white/10 text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 border border-white/10 transition-colors"
            >
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" /> .m3u для VLC
            </a>

            <button
              onClick={handleCopyLink}
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-surface hover:bg-white/10 text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 sm:gap-2 border border-white/10 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-400" />}
              <span className="hidden sm:inline">{copied ? 'Скопировано!' : 'Ссылка для VLC'}</span>
              <span className="sm:hidden">{copied ? 'Скопировано' : 'VLC ссылка'}</span>
            </button>

            <button
              onClick={() => {
                setPlayerError(null);
                window.location.reload();
              }}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-zinc-400 hover:text-white text-[11px] sm:text-xs font-medium flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Повторить
            </button>
          </div>
        </div>
      ) : null}

      {/* Video Container Mount */}
      <div ref={artRef} className="w-full h-full" />

      {/* Floating TorrServer Real-Time Stats HUD */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-30 pointer-events-none transition-opacity duration-300 opacity-90 group-hover:opacity-100 max-w-[calc(100%-1rem)]">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 bg-black/80 backdrop-blur-md px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-white/10 text-[10px] sm:text-xs shadow-lg">
          {/* Status Indicator */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-emerald-400 font-semibold">
            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400 animate-ping" />
            <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5 hidden sm:block" />
            <span className="hidden sm:inline">{stats?.status || 'Подключение к TorrServer...'}</span>
            <span className="sm:hidden">{stats?.status ? 'P2P' : 'Подкл...'}</span>
          </div>

          <span className="text-zinc-600">|</span>

          {/* Download Speed */}
          <div className="flex items-center gap-1 text-cyan-300 font-medium">
            <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            <span>{stats?.formattedSpeed || '0 KB/s'}</span>
          </div>

          <span className="text-zinc-600">|</span>

          {/* Seeds / Peers */}
          <div className="flex items-center gap-1 text-zinc-300">
            <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
            <span>
              <span className="hidden sm:inline">Сиды: </span>
              <b className="text-white">{stats?.seeders ?? 0}</b>
              <span className="text-zinc-500"> / </span>
              <span className="hidden sm:inline">Пиры: </span>
              <b className="text-zinc-400">{stats?.activePeers ?? 0}</b>
            </span>
          </div>

          {/* Preload Progress if buffering */}
          {isBuffering && stats && stats.preloadProgress < 100 && (
            <>
              <span className="text-zinc-600">|</span>
              <div className="flex items-center gap-1 text-amber-300">
                <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-pulse" />
                <span>{stats.preloadProgress}%</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
