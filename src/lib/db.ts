import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database directory: /app/data in Docker or ./data in development
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'kinostream.db');

// Singleton database instance
let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) return dbInstance;

  dbInstance = new Database(DB_PATH);

  // Enable WAL (Write-Ahead Logging) for concurrent access & performance
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Initialize tables
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

  return dbInstance;
}

export const db = {
  get: () => getDatabase(),
};
