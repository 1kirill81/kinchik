import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { WatchProgress } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: true, items: [] });
  }

  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT media_id, media_type, title, poster, hash, file_index, stream_url, season, episode, episode_title, current_time, duration, progress_percent, updated_at FROM watch_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
    )
    .all(user.userId) as any[];

  const items: WatchProgress[] = rows.map((r) => ({
    mediaId: r.media_id || undefined,
    mediaType: r.media_type,
    title: r.title,
    poster: r.poster || undefined,
    hash: r.hash,
    fileIndex: r.file_index,
    streamUrl: r.stream_url,
    season: r.season || undefined,
    episode: r.episode || undefined,
    episodeTitle: r.episode_title || undefined,
    currentTime: r.current_time,
    duration: r.duration,
    progressPercent: r.progress_percent,
    updatedAt: r.updated_at,
  }));

  return NextResponse.json({ success: true, items });
}

export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const p: WatchProgress = await request.json();
    const db = getDatabase();
    const now = Date.now();

    const existing = db
      .prepare('SELECT id FROM watch_progress WHERE user_id = ? AND hash = ? AND file_index = ?')
      .get(user.userId, p.hash, p.fileIndex) as { id: number } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE watch_progress SET
          media_id = ?,
          media_type = ?,
          title = ?,
          poster = ?,
          stream_url = ?,
          season = ?,
          episode = ?,
          episode_title = ?,
          current_time = ?,
          duration = ?,
          progress_percent = ?,
          updated_at = ?
        WHERE id = ?`
      ).run(
        p.mediaId || null,
        p.mediaType,
        p.title,
        p.poster || null,
        p.streamUrl,
        p.season || null,
        p.episode || null,
        p.episodeTitle || null,
        p.currentTime,
        p.duration,
        p.progressPercent,
        now,
        existing.id
      );
    } else {
      db.prepare(
        `INSERT INTO watch_progress (
          user_id, media_id, media_type, title, poster, hash, file_index, stream_url, season, episode, episode_title, current_time, duration, progress_percent, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        user.userId,
        p.mediaId || null,
        p.mediaType,
        p.title,
        p.poster || null,
        p.hash,
        p.fileIndex,
        p.streamUrl,
        p.season || null,
        p.episode || null,
        p.episodeTitle || null,
        p.currentTime,
        p.duration,
        p.progressPercent,
        now
      );
    }

    // Also update favorite's last_watched if exists
    if (p.mediaId) {
      const fav = db
        .prepare('SELECT id FROM favorites WHERE user_id = ? AND media_id = ? AND media_type = ?')
        .get(user.userId, p.mediaId, p.mediaType) as { id: number } | undefined;

      if (fav) {
        const lastWatchedJson = JSON.stringify({
          season: p.season,
          episode: p.episode,
          episodeTitle: p.episodeTitle,
          fileIndex: p.fileIndex,
          hash: p.hash,
          streamUrl: p.streamUrl,
          currentTime: p.currentTime,
          duration: p.duration,
          progressPercent: p.progressPercent,
          updatedAt: now,
        });

        db.prepare('UPDATE favorites SET last_watched_json = ? WHERE id = ?').run(
          lastWatchedJson,
          fav.id
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
