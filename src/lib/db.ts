import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database directory: /app/data in Docker or ./data in development
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

if (!fs.existsSync(/*turbopackIgnore: true*/ DATA_DIR)) {
  fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'kinostream.db');

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  dbInstance = new Database(DB_PATH);

  // Performance & Concurrency Pragmas
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('busy_timeout = 5000');
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('wal_autocheckpoint = 1000');

  // Schema Versioning & Migrations
  const currentVersion = Number(dbInstance.pragma('user_version', { simple: true }) || 0);

  if (currentVersion < 1) {
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_id INTEGER NOT NULL,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        poster_path TEXT,
        backdrop_path TEXT,
        vote_average REAL DEFAULT 0,
        release_date TEXT,
        first_air_date TEXT,
        last_watched_json TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, media_id, media_type)
      );

      CREATE TABLE IF NOT EXISTS watch_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        media_id INTEGER,
        media_type TEXT NOT NULL,
        title TEXT NOT NULL,
        poster TEXT,
        hash TEXT NOT NULL,
        file_index INTEGER NOT NULL,
        stream_url TEXT NOT NULL,
        season INTEGER,
        episode INTEGER,
        episode_title TEXT,
        current_time REAL NOT NULL,
        duration REAL NOT NULL,
        progress_percent INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, hash, file_index)
      );

      CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
      CREATE INDEX IF NOT EXISTS idx_progress_user ON watch_progress(user_id);
    `);
    dbInstance.pragma('user_version = 1');
  }

  if (currentVersion < 2) {
    dbInstance.exec(`
      CREATE INDEX IF NOT EXISTS idx_watch_progress_user_updated ON watch_progress(user_id, updated_at DESC);
    `);
    dbInstance.pragma('user_version = 2');
  }

  return dbInstance;
}

export interface WatchProgressInput {
  userId: number;
  mediaId?: number | null;
  mediaType: string;
  title: string;
  poster?: string | null;
  hash: string;
  fileIndex: number;
  streamUrl: string;
  season?: number | null;
  episode?: number | null;
  episodeTitle?: string | null;
  currentTime: number;
  duration: number;
  progressPercent: number;
}

/**
 * Atomic watch progress persistence:
 * Uses a single atomic INSERT ... ON CONFLICT DO UPDATE inside a transaction
 * and synchronizes favorites.last_watched_json.
 */
export function upsertWatchProgress(p: WatchProgressInput): void {
  const db = getDatabase();
  const now = Date.now();

  const tx = db.transaction(() => {
    // 1. Single atomic upsert into watch_progress
    db.prepare(`
      INSERT INTO watch_progress (
        user_id, media_id, media_type, title, poster, hash, file_index,
        stream_url, season, episode, episode_title, current_time,
        duration, progress_percent, updated_at
      ) VALUES (
        @userId, @mediaId, @mediaType, @title, @poster, @hash, @fileIndex,
        @streamUrl, @season, @episode, @episodeTitle, @currentTime,
        @duration, @progressPercent, @updatedAt
      )
      ON CONFLICT(user_id, hash, file_index) DO UPDATE SET
        media_id = excluded.media_id,
        media_type = excluded.media_type,
        title = excluded.title,
        poster = excluded.poster,
        stream_url = excluded.stream_url,
        season = excluded.season,
        episode = excluded.episode,
        episode_title = excluded.episode_title,
        current_time = excluded.current_time,
        duration = excluded.duration,
        progress_percent = excluded.progress_percent,
        updated_at = excluded.updated_at
    `).run({
      userId: p.userId,
      mediaId: p.mediaId || null,
      mediaType: p.mediaType,
      title: p.title,
      poster: p.poster || null,
      hash: p.hash,
      fileIndex: p.fileIndex,
      streamUrl: p.streamUrl,
      season: p.season || null,
      episode: p.episode || null,
      episodeTitle: p.episodeTitle || null,
      currentTime: p.currentTime,
      duration: p.duration,
      progressPercent: p.progressPercent,
      updatedAt: now,
    });

    // 2. Synchronize favorites.last_watched_json inside the same transaction
    if (p.mediaId) {
      const lastWatchedJson = JSON.stringify({
        season: p.season,
        episode: p.episode,
        currentTime: p.currentTime,
        duration: p.duration,
        progressPercent: p.progressPercent,
        updatedAt: now,
      });

      db.prepare(`
        UPDATE favorites
        SET last_watched_json = ?
        WHERE user_id = ? AND media_id = ? AND media_type = ?
      `).run(lastWatchedJson, p.userId, p.mediaId, p.mediaType);
    }
  });

  tx();
}

export const db = {
  get: () => getDatabase(),
};
