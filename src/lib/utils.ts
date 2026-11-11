import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes to readable string (e.g. 1.45 GB, 750 MB)
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeIndex = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm))} ${sizes[safeIndex]}`;
}

/**
 * Format speed in bytes/sec to readable string (e.g. 4.2 MB/s)
 */
export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

/**
 * Format minutes into "2h 15m" or "45m"
 */
export function formatRuntime(minutes?: number): string {
  if (!minutes || minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Extract 4-digit release year from date string (e.g. "2024-03-01" -> "2024")
 */
import { SubtitleTrackOption } from '@/types/torrent';

export function formatYear(dateStr?: string): string {
  if (!dateStr) return '';
  return dateStr.substring(0, 4);
}

/**
 * Decode subtitle bytes cleanly to UTF-8, handling BOMs and CP1251 Cyrillic files.
 */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }

  const startOffset =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const slice = startOffset > 0 ? bytes.subarray(startOffset) : bytes;

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(slice);
  } catch {
    return new TextDecoder('windows-1251').decode(slice);
  }
}

/**
 * Pick the best subtitle track when toggling subtitles ON quickly.
 */
export function pickPreferredSubtitleTrack(
  tracks: SubtitleTrackOption[],
  lastSelectedId?: string | null
): SubtitleTrackOption | undefined {
  return (
    (lastSelectedId ? tracks.find((t) => t.id === lastSelectedId) : undefined) ||
    tracks.find((t) => t.source === 'local') ||
    tracks.find((t) => t.source === 'torrent' && t.language === 'RUS') ||
    tracks.find((t) => t.language === 'RUS') ||
    tracks[0]
  );
}
