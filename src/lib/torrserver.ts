import { TorrServerFile, TorrServerLiveStats, TorrServerTorrent } from '@/types/torrent';
import { formatBytes, formatSpeed } from './utils';

const TORRSERVER_INTERNAL_URL = (process.env.TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');
const TORRSERVER_PUBLIC_URL = (process.env.NEXT_PUBLIC_TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');

const VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.webm', '.ts', '.mov', '.m4v'];

export function isVideoFile(path: string): boolean {
  const lower = path.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isSampleFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('sample') || lower.includes('trailer') || lower.includes('promo');
}

export const torrserver = {
  /**
   * Healthcheck to verify TorrServer is running
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${TORRSERVER_INTERNAL_URL}/echo`, { cache: 'no-store' });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Register a torrent (magnet or .torrent URL) in TorrServer
   */
  async addTorrent(link: string, title: string, poster?: string): Promise<TorrServerTorrent> {
    const res = await fetch(`${TORRSERVER_INTERNAL_URL}/torrents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        link,
        title,
        poster: poster || '',
        data: '',
        save_to_db: true,
      }),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Failed to add torrent to TorrServer: ${res.statusText}`);
    }

    const data: TorrServerTorrent = await res.json();
    return data;
  },

  /**
   * Get torrent metadata and file stats by info-hash
   */
  async getTorrent(hash: string): Promise<TorrServerTorrent | null> {
    try {
      const res = await fetch(`${TORRSERVER_INTERNAL_URL}/torrents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get',
          hash,
        }),
        cache: 'no-store',
      });

      if (!res.ok) return null;
      const data: TorrServerTorrent = await res.json();

      // In TorrServer MatriX, files are also stored inside data.TorrServer.Files
      if ((!data.file_stats || data.file_stats.length === 0) && data.data) {
        try {
          const parsed = JSON.parse(data.data);
          if (parsed?.TorrServer?.Files && Array.isArray(parsed.TorrServer.Files)) {
            data.file_stats = parsed.TorrServer.Files;
          }
        } catch (e) {
          // ignore json parse error
        }
      }

      return data;
    } catch (e) {
      console.error('Failed to get torrent from TorrServer:', e);
      return null;
    }
  },

  /**
   * Wait and poll until TorrServer retrieves the torrent metadata from DHT/trackers
   */
  async getTorrentWithFiles(hash: string, maxAttempts = 8, intervalMs = 1200): Promise<TorrServerTorrent> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const data = await this.getTorrent(hash);
      if (data && data.file_stats && data.file_stats.length > 0) {
        return data;
      }
      // Wait before next attempt
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    const finalCheck = await this.getTorrent(hash);
    if (!finalCheck) {
      throw new Error('Torrent not found in TorrServer');
    }
    return finalCheck;
  },

  /**
   * Intelligently select the best video file from a torrent.
   * If season & episode are provided, matches the exact episode (e.g. S01E03 or 1x03).
   * Otherwise selects the largest non-sample video file.
   */
  selectBestVideoFile(files: TorrServerFile[], season?: number, episode?: number): TorrServerFile | null {
    if (!files || files.length === 0) return null;

    const videoFiles = files.filter((f) => isVideoFile(f.path) && !isSampleFile(f.path));
    if (videoFiles.length === 0) {
      // Fallback: any video file
      const anyVideo = files.filter((f) => isVideoFile(f.path));
      if (anyVideo.length > 0) return anyVideo[0];
      return files[0];
    }

    // If searching for a specific TV episode:
    if (episode !== undefined) {
      const sNum = season !== undefined ? season.toString().padStart(2, '0') : '\\d{1,2}';
      const eNum = episode.toString().padStart(2, '0');

      const patterns = [
        new RegExp(`s${sNum}e${eNum}\\b`, 'i'),
        new RegExp(`s${sNum}\\.?e${episode}\\b`, 'i'),
        new RegExp(`\\[${season || 1}x${eNum}\\]|\\b${season || 1}x${eNum}\\b`, 'i'),
        new RegExp(`\\b${episode}\\s*серия|серия\\s*${episode}\\b`, 'i'),
        new RegExp(`\\bep?\\.?${eNum}\\b`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = videoFiles.find((f) => pattern.test(f.path));
        if (match) return match;
      }
    }

    // For movies: sort by file size descending (the main movie file is almost always the largest)
    const sorted = [...videoFiles].sort((a, b) => b.length - a.length);
    return sorted[0];
  },

  /**
   * Preload torrent buffer in TorrServer
   */
  async preloadTorrent(hash: string, fileIndex: number): Promise<boolean> {
    try {
      const url = `${TORRSERVER_INTERNAL_URL}/stream?link=${hash}&index=${fileIndex}&preload`;
      // Trigger preload non-blocking
      fetch(url, { cache: 'no-store' }).catch(() => {});
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Generate direct streaming URL to be consumed by the player
   */
  buildStreamUrl(hash: string, fileIndex: number, title: string): string {
    const cleanTitle = encodeURIComponent(title.replace(/[\\/:*?"<>|]/g, ''));
    return `${TORRSERVER_PUBLIC_URL}/stream/${cleanTitle}?link=${hash}&index=${fileIndex}&play`;
  },

  /**
   * Get live download statistics for overlay/HUD
   */
  async getLiveStats(hash: string): Promise<TorrServerLiveStats | null> {
    const torrent = await this.getTorrent(hash);
    if (!torrent) return null;

    const downloadSpeed = torrent.download_speed || 0;
    const preloadSize = torrent.preload_size || 1;
    const preloadedBytes = torrent.preloaded_bytes || 0;
    const preloadProgress = Math.min(100, Math.round((preloadedBytes / preloadSize) * 100));

    let status = torrent.stat_string || 'Connecting';
    if (torrent.stat === 2) status = 'Streaming';
    else if (torrent.stat === 1) status = `Preloading ${preloadProgress}%`;

    return {
      hash,
      title: torrent.title,
      status,
      preloadProgress,
      downloadSpeed,
      formattedSpeed: formatSpeed(downloadSpeed),
      seeders: torrent.connected_seeders || 0,
      activePeers: torrent.active_peers || 0,
      totalPeers: torrent.total_peers || 0,
      preloadedBytes,
      preloadSize,
      isReady: (torrent.stat === 2) || (preloadProgress >= 100),
    };
  },
};
