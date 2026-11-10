import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { FavoriteItem } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: true, items: [] });
  }

  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT id, media_id, media_type, title, poster_path, backdrop_path, vote_average, release_date, first_air_date, last_watched_json, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC'
    )
    .all(user.userId) as any[];

  const items: FavoriteItem[] = rows.map((r) => ({
    id: r.media_id,
    mediaType: r.media_type,
    title: r.title,
    poster_path: r.poster_path,
    backdrop_path: r.backdrop_path,
    vote_average: r.vote_average,
    release_date: r.release_date || undefined,
    first_air_date: r.first_air_date || undefined,
    addedAt: r.created_at,
    lastWatched: r.last_watched_json ? JSON.parse(r.last_watched_json) : undefined,
  }));

  return NextResponse.json({ success: true, items });
}

export async function POST(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const item = await request.json();
    const db = getDatabase();

    const existing = db
      .prepare('SELECT id FROM favorites WHERE user_id = ? AND media_id = ? AND media_type = ?')
      .get(user.userId, item.id, item.mediaType) as { id: number } | undefined;

    let isAdded = false;

    if (existing) {
      db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
      isAdded = false;
    } else {
      const now = Date.now();
      const lastWatchedJson = item.lastWatched ? JSON.stringify(item.lastWatched) : null;
      db.prepare(
        `INSERT INTO favorites (
          user_id, media_id, media_type, title, poster_path, backdrop_path, vote_average, release_date, first_air_date, last_watched_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        user.userId,
        item.id,
        item.mediaType,
        item.title,
        item.poster_path || null,
        item.backdrop_path || null,
        item.vote_average || 0,
        item.release_date || null,
        item.first_air_date || null,
        lastWatchedJson,
        now
      );
      isAdded = true;
    }

    return NextResponse.json({ success: true, isAdded });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
