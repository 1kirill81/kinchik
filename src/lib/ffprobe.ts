import { spawn } from 'child_process';
import { AudioTrackInfo, MediaProbeInfo } from '@/types/torrent';

const TORRSERVER_INTERNAL_URL = (process.env.TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_PROBE_CACHE_SIZE = 200;
const MAX_STDOUT_BYTES = 2 * 1024 * 1024; // 2 MB limit

interface CacheEntry {
  data: MediaProbeInfo;
  expiresAt: number;
}

const probeCache = new Map<string, CacheEntry>();
const inflightProbes = new Map<string, Promise<MediaProbeInfo>>();

// Periodic cache cleanup
if (typeof setInterval !== 'undefined') {
  const probeCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of probeCache.entries()) {
      if (value.expiresAt <= now) {
        probeCache.delete(key);
      }
    }
  }, 120000);
  if (probeCleanupTimer.unref) {
    probeCleanupTimer.unref();
  }
}

const LANGUAGE_MAP: Record<string, string> = {
  rus: 'Русский',
  ru: 'Русский',
  eng: 'Английский',
  en: 'Английский',
  ukr: 'Украинский',
  uk: 'Украинский',
  jpn: 'Японский',
  ja: 'Японский',
  kor: 'Корейский',
  ko: 'Корейский',
  fra: 'Французский',
  fre: 'Французский',
  fr: 'Французский',
  deu: 'Немецкий',
  ger: 'Немецкий',
  de: 'Немецкий',
  spa: 'Испанский',
  es: 'Испанский',
  ita: 'Итальянский',
  it: 'Итальянский',
  zho: 'Китайский',
  chi: 'Китайский',
  zh: 'Китайский',
  por: 'Португальский',
  pt: 'Португальский',
  tur: 'Турецкий',
  tr: 'Турецкий',
};

function parseDurationTag(raw?: string): number {
  if (!raw) return 0;
  const match = raw.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const secs = parseFloat(`${match[3]}.${match[4] || '0'}`);
  return hours * 3600 + mins * 60 + secs;
}

function extractDuration(probeJson: any): number {
  const formatDur = parseFloat(probeJson?.format?.duration);
  if (!isNaN(formatDur) && formatDur > 0 && isFinite(formatDur)) {
    return formatDur;
  }

  const streams: any[] = Array.isArray(probeJson?.streams) ? probeJson.streams : [];
  for (const s of streams) {
    const sDur = parseFloat(s?.duration);
    if (!isNaN(sDur) && sDur > 0 && isFinite(sDur)) {
      return sDur;
    }
  }

  for (const s of streams) {
    if (!s?.tags) continue;
    for (const [k, v] of Object.entries(s.tags)) {
      if (k.toUpperCase().startsWith('DURATION') && typeof v === 'string') {
        const parsed = parseDurationTag(v);
        if (parsed > 0) return parsed;
      }
    }
  }

  return 0;
}

function formatAudioLabel(
  langRaw: string,
  titleRaw: string,
  audioOrder: number,
  codec: string,
  channels: number
): string {
  const langLower = langRaw.toLowerCase().trim();
  const titleClean = titleRaw.trim();
  const langName =
    LANGUAGE_MAP[langLower] || (langLower && langLower !== 'und' ? langRaw.toUpperCase() : '');

  let mainPart = '';
  if (langName && titleClean) {
    mainPart = `${langName} — ${titleClean}`;
  } else if (titleClean) {
    mainPart = titleClean;
  } else if (langName) {
    mainPart = langName;
  } else {
    mainPart = `Дорожка ${audioOrder + 1}`;
  }

  const chLabel =
    channels === 6 ? '5.1' : channels === 8 ? '7.1' : channels === 2 ? '2.0' : channels ? `${channels}ch` : '';
  const metaParts = [codec ? codec.toUpperCase() : '', chLabel].filter(Boolean).join(' ');

  return metaParts ? `${mainPart} (${metaParts})` : mainPart;
}

function isRussianAudio(track: AudioTrackInfo): boolean {
  const lang = track.language.toLowerCase();
  const title = track.title.toLowerCase();
  return (
    lang === 'rus' ||
    lang === 'ru' ||
    lang.includes('rus') ||
    title.includes('rus') ||
    title.includes('рус') ||
    title.includes('дубл') ||
    title.includes('lostfilm') ||
    title.includes('кубик') ||
    title.includes('hdrezka') ||
    title.includes('newstudio') ||
    title.includes('alexfilm') ||
    title.includes('novafilm') ||
    title.includes('рен-тв') ||
    title.includes('пифагор') ||
    title.includes('mvo') ||
    title.includes('dvo') ||
    title.includes('dub')
  );
}

async function runFfprobe(torrUrl: string, timeoutMs: number): Promise<MediaProbeInfo> {
  const emptyFallback: MediaProbeInfo = {
    duration: 0,
    videoStreamIndex: null,
    videoCodec: '',
    isH264: true,
    audioTracks: [],
    defaultAudioIndex: null,
  };

  try {
    const probeJson = await new Promise<any>((resolve) => {
      const proc = spawn('ffprobe', [
        '-v', 'error',
        '-analyzeduration', '15000000',
        '-probesize', '15000000',
        '-show_format',
        '-show_streams',
        '-of', 'json',
        torrUrl,
      ], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      let out = '';
      let bytesRead = 0;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (val: any) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(val);
      };

      timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        finish(null);
      }, timeoutMs);

      proc.stdout.on('data', (d: Buffer) => {
        bytesRead += d.length;
        if (bytesRead > MAX_STDOUT_BYTES) {
          try {
            proc.kill('SIGKILL');
          } catch {}
          finish(null);
          return;
        }
        out += d.toString('utf8');
      });

      proc.on('close', () => {
        try {
          finish(JSON.parse(out));
        } catch {
          finish(null);
        }
      });

      proc.on('error', () => finish(null));
    });

    if (!probeJson || !Array.isArray(probeJson.streams)) {
      return emptyFallback;
    }

    const streams: any[] = probeJson.streams;
    const duration = extractDuration(probeJson);

    const vStream = streams.find((s) => s.codec_type === 'video');
    const videoStreamIndex = vStream ? Number(vStream.index) : null;
    const videoCodec = (vStream?.codec_name || '').toLowerCase();
    const isH264 = !videoCodec || videoCodec.includes('h264') || videoCodec.includes('avc');

    const rawAudioStreams = streams.filter((s) => s.codec_type === 'audio');
    const audioTracks: AudioTrackInfo[] = rawAudioStreams.map((s, order) => {
      const language = (s.tags?.language || '').toString();
      const title = (s.tags?.title || s.tags?.handler_name || '').toString();
      const codec = (s.codec_name || '').toString();
      const channels = Number(s.channels || 0);

      return {
        index: Number(s.index),
        audioOrder: order,
        language,
        title,
        codec,
        channels,
        label: formatAudioLabel(language, title, order, codec, channels),
      };
    });

    const rusTrack = audioTracks.find(isRussianAudio);
    const defaultAudioIndex = rusTrack
      ? rusTrack.index
      : audioTracks.length > 0
      ? audioTracks[0].index
      : null;

    return {
      duration,
      videoStreamIndex,
      videoCodec,
      isH264,
      audioTracks,
      defaultAudioIndex,
    };
  } catch (err) {
    console.warn('ffprobe failed:', err);
    return emptyFallback;
  }
}

/**
 * Probe torrent media file metadata (duration, codecs, audio tracks) with deduplication & bounded LRU caching
 */
export async function probeTorrentMedia(
  hash: string,
  fileIndex: string | number,
  title: string,
  timeoutMs = 7000
): Promise<MediaProbeInfo> {
  const key = `${hash}:${fileIndex}`;
  const now = Date.now();

  const cached = probeCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const existingInflight = inflightProbes.get(key);
  if (existingInflight) {
    return existingInflight;
  }

  const torrUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(title)}?link=${hash}&index=${fileIndex}&play`;

  const promise = (async () => {
    try {
      const info = await runFfprobe(torrUrl, timeoutMs);

      if (info.duration > 0 || info.audioTracks.length > 0 || info.videoStreamIndex !== null) {
        // Enforce maximum LRU cache size
        if (probeCache.size >= MAX_PROBE_CACHE_SIZE) {
          const oldestKey = probeCache.keys().next().value;
          if (oldestKey) probeCache.delete(oldestKey);
        }

        probeCache.set(key, {
          data: info,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
      }

      return info;
    } finally {
      inflightProbes.delete(key);
    }
  })();

  inflightProbes.set(key, promise);
  return promise;
}
