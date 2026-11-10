export type VideoQuality = '4K' | '1080p' | '720p' | '480p' | 'Unknown';

export interface TorrentItem {
  id: string;
  title: string;
  category: number[];
  size: number; // bytes
  formattedSize: string;
  publishDate: string;
  seeders: number;
  peers: number;
  link: string; // download url or magnet
  magnetUrl?: string;
  indexer: string;
  quality: VideoQuality;
  codec?: string; // HEVC, x264, etc.
  audio?: string; // Dub, Rus, Eng, etc.
  ripType?: string; // BDRip, WEB-DL, etc.
}

export interface ParsedEpisodeFile {
  id: number;
  path: string;
  season: number;
  episode: number;
  title: string;
  length: number;
  formattedSize: string;
}

export interface TorrServerFile {
  id: number; // 1-based index in TorrServer
  path: string;
  length: number;
  viewed?: boolean;
}

export interface TorrServerTorrent {
  title: string;
  poster?: string;
  data?: string;
  hash: string;
  stat?: number; // 0 - TorrentNull, 1 - Preload, 2 - Working, 3 - Closed
  stat_string?: string;
  loaded_size?: number;
  torrent_size?: number;
  preloaded_bytes?: number;
  preload_size?: number;
  download_speed?: number; // bytes/sec
  upload_speed?: number; // bytes/sec
  total_peers?: number;
  connected_seeders?: number;
  active_peers?: number;
  half_open_peers?: number;
  bytes_read?: number;
  file_stats?: TorrServerFile[];
}

export interface StreamPrepareRequest {
  link: string; // magnet link or torrent download URL
  title: string;
  poster?: string;
  fileIndex?: number; // optional pre-chosen file
  season?: number; // optional for TV series file auto-match
  episode?: number; // optional for TV series file auto-match
}

export interface StreamPrepareResponse {
  hash: string;
  title: string;
  fileIndex: number;
  fileName: string;
  fileSize: number;
  formattedFileSize: string;
  streamUrl: string;
  files: {
    id: number;
    path: string;
    length: number;
    formattedSize: string;
    isVideo: boolean;
  }[];
}

export interface TorrServerLiveStats {
  hash: string;
  title: string;
  status: string;
  preloadProgress: number; // 0 - 100%
  downloadSpeed: number; // bytes/sec
  formattedSpeed: string;
  seeders: number;
  activePeers: number;
  totalPeers: number;
  preloadedBytes: number;
  preloadSize: number;
  isReady: boolean;
}
