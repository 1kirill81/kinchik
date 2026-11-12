import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'kinostream.db');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '7', 10);

async function performBackup() {
  console.log(`[Backup] Starting database backup from: ${DB_PATH}`);

  if (!fs.existsSync(DB_PATH)) {
    console.warn(`[Backup] Database file not found at ${DB_PATH}. Skipping backup.`);
    return;
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `kinostream-backup-${timestamp}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  try {
    await db.backup(backupFilePath);
    const stats = fs.statSync(backupFilePath);
    console.log(`[Backup] Successfully created backup: ${backupFilePath} (${(stats.size / 1024).toFixed(1)} KB)`);

    // Prune old backups exceeding MAX_BACKUPS
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('kinostream-backup-') && f.endsWith('.db'))
      .map((f) => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > MAX_BACKUPS) {
      const toRemove = files.slice(MAX_BACKUPS);
      for (const file of toRemove) {
        fs.unlinkSync(file.path);
        console.log(`[Backup] Pruned old backup: ${file.name}`);
      }
    }
  } catch (err) {
    console.error('[Backup] Backup failed with error:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

performBackup();
