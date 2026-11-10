export interface WatchProgress {
  mediaId?: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster?: string;
  hash: string;
  fileIndex: number;
  streamUrl: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  currentTime: number; // in seconds
  duration: number; // in seconds
  progressPercent: number; // 0 - 100
  updatedAt: number;
}

export interface FavoriteItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  addedAt: number;
  lastWatched?: {
    season?: number;
    episode?: number;
    episodeTitle?: string;
    fileIndex?: number;
    hash?: string;
    streamUrl?: string;
    currentTime?: number;
    duration?: number;
    progressPercent?: number;
    updatedAt: number;
  };
}

const FAVORITES_KEY = 'kinostream_favorites_v1';
const PROGRESS_KEY = 'kinostream_watch_progress_v1';

// Custom event to sync components across the app
export const STORAGE_CHANGE_EVENT = 'kinostream_storage_updated';

function triggerStorageEvent() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
  }
}

export const storage = {
  // --- FAVORITES ---
  getFavorites(): FavoriteItem[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  isFavorite(id: number, mediaType: 'movie' | 'tv'): boolean {
    const list = this.getFavorites();
    return list.some((item) => item.id === id && item.mediaType === mediaType);
  },

  toggleFavorite(item: Omit<FavoriteItem, 'addedAt'>): boolean {
    const list = this.getFavorites();
    const existingIndex = list.findIndex(
      (f) => f.id === item.id && f.mediaType === item.mediaType
    );

    let isAdded = false;
    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
    } else {
      // Check if we have progress saved for this item to attach
      const progress =
        this.getProgressByMediaId(item.id, item.mediaType) ||
        this.getAllProgress().find(
          (p) => p.title.toLowerCase().trim() === item.title.toLowerCase().trim()
        );

      list.unshift({
        ...item,
        addedAt: Date.now(),
        lastWatched: progress
          ? {
              season: progress.season,
              episode: progress.episode,
              episodeTitle: progress.episodeTitle,
              fileIndex: progress.fileIndex,
              hash: progress.hash,
              streamUrl: progress.streamUrl,
              currentTime: progress.currentTime,
              duration: progress.duration,
              progressPercent: progress.progressPercent,
              updatedAt: progress.updatedAt,
            }
          : undefined,
      });
      isAdded = true;
    }

    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
      triggerStorageEvent();

      // Background sync to server if user is authenticated
      fetch('/api/user/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      }).catch(() => {});
    } catch (e) {
      console.error('Failed to save favorites to localStorage:', e);
    }

    return isAdded;
  },

  // --- WATCH PROGRESS & "LAST WATCHED" ---
  getAllProgress(): WatchProgress[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(PROGRESS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  getProgressByMediaId(mediaId: number, mediaType: 'movie' | 'tv'): WatchProgress | null {
    const list = this.getAllProgress();
    return list.find((p) => p.mediaId === mediaId && p.mediaType === mediaType) || null;
  },

  getProgressByHash(hash: string): WatchProgress | null {
    const list = this.getAllProgress();
    return list.find((p) => p.hash === hash) || null;
  },

  getProgressForItem(item: { id?: number; mediaType: 'movie' | 'tv'; title?: string }): WatchProgress | null {
    if (item.id) {
      const byId = this.getProgressByMediaId(item.id, item.mediaType);
      if (byId) return byId;
    }
    if (item.title) {
      const clean = item.title.toLowerCase().trim();
      const byTitle = this.getAllProgress().find(
        (p) => p.title.toLowerCase().trim() === clean
      );
      if (byTitle) return byTitle;
    }
    return null;
  },

  saveProgress(progress: WatchProgress): void {
    if (typeof window === 'undefined') return;

    const list = this.getAllProgress();
    // Unique key: mediaId if present, otherwise hash or title
    const matchIndex = list.findIndex((p) => {
      if (progress.mediaId && p.mediaId) {
        return p.mediaId === progress.mediaId && p.mediaType === progress.mediaType;
      }
      if (progress.hash && p.hash) {
        return p.hash === progress.hash;
      }
      return p.title.toLowerCase().trim() === progress.title.toLowerCase().trim();
    });

    if (matchIndex >= 0) {
      list[matchIndex] = {
        ...list[matchIndex],
        ...progress,
        updatedAt: Date.now(),
      };
    } else {
      list.unshift({ ...progress, updatedAt: Date.now() });
    }

    // Keep last 40 items
    const trimmed = list.slice(0, 40);

    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(trimmed));

      // Also update favorite's lastWatched if this item is in favorites
      const favs = this.getFavorites();
      const favIndex = favs.findIndex((f) => {
        if (progress.mediaId && f.id === progress.mediaId && f.mediaType === progress.mediaType) {
          return true;
        }
        return f.title.toLowerCase().trim() === progress.title.toLowerCase().trim();
      });

      if (favIndex >= 0) {
        favs[favIndex].lastWatched = {
          season: progress.season,
          episode: progress.episode,
          episodeTitle: progress.episodeTitle,
          fileIndex: progress.fileIndex,
          hash: progress.hash,
          streamUrl: progress.streamUrl,
          currentTime: progress.currentTime,
          duration: progress.duration,
          progressPercent: progress.progressPercent,
          updatedAt: Date.now(),
        };
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
      }

      triggerStorageEvent();

      // Background sync to server if user is authenticated
      fetch('/api/user/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(progress),
      }).catch(() => {});
    } catch (e) {
      console.error('Failed to save watch progress to localStorage:', e);
    }
  },

  removeProgress(hashOrTitle: string): void {
    if (typeof window === 'undefined') return;
    const list = this.getAllProgress().filter(
      (p) => p.hash !== hashOrTitle && p.title !== hashOrTitle
    );
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(list));
      triggerStorageEvent();
    } catch (e) {}
  },

  async syncWithServer(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const [favRes, progRes] = await Promise.all([
        fetch('/api/user/favorites', { cache: 'no-store' }),
        fetch('/api/user/progress', { cache: 'no-store' }),
      ]);

      if (favRes.ok) {
        const favData = await favRes.json();
        if (favData.success && Array.isArray(favData.items) && favData.items.length > 0) {
          localStorage.setItem(FAVORITES_KEY, JSON.stringify(favData.items));
        }
      }

      if (progRes.ok) {
        const progData = await progRes.json();
        if (progData.success && Array.isArray(progData.items) && progData.items.length > 0) {
          localStorage.setItem(PROGRESS_KEY, JSON.stringify(progData.items));
        }
      }

      triggerStorageEvent();
    } catch {}
  },
};
