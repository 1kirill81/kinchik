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

export async function PUT(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const item = await request.json();
    if (!item.id || !item.mediaType || !item.title) {
      return NextResponse.json(
        { success: false, error: 'id, mediaType, and title are required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const now = Date.now();
    const lastWatchedJson = item.lastWatched ? JSON.stringify(item.lastWatched) : null;

    db.prepare(`
      INSERT INTO favorites (
        user_id, media_id, media_type, title, poster_path, backdrop_path,
        vote_average, release_date, first_air_date, last_watched_json, created_at
      ) VALUES (
        @userId, @mediaId, @mediaType, @title, @posterPath, @backdropPath,
        @voteAverage, @releaseDate, @firstAirDate, @lastWatchedJson, @createdAt
      )
      ON CONFLICT(user_id, media_id, media_type) DO UPDATE SET
        title = excluded.title,
        poster_path = excluded.poster_path,
        backdrop_path = excluded.backdrop_path,
        vote_average = excluded.vote_average,
        release_date = excluded.release_date,
        first_air_date = excluded.first_air_date,
        last_watched_json = COALESCE(excluded.last_watched_json, favorites.last_watched_json)
    `).run({
      userId: user.userId,
      mediaId: Number(item.id),
      mediaType: item.mediaType,
      title: String(item.title).trim(),
      posterPath: item.poster_path || null,
      backdropPath: item.backdrop_path || null,
      voteAverage: Number(item.vote_average) || 0,
      releaseDate: item.release_date || null,
      firstAirDate: item.first_air_date || null,
      lastWatchedJson,
      createdAt: now,
    });

    return NextResponse.json({ success: true, isAdded: true });
  } catch (err: any) {
    console.error('Favorites PUT error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let mediaId: number | undefined;
    let mediaType: string | undefined;

    const { searchParams } = new URL(request.url);
    if (searchParams.has('id') && searchParams.has('mediaType')) {
      mediaId = Number(searchParams.get('id'));
      mediaType = searchParams.get('mediaType') || undefined;
    } else {
      const body = await request.json().catch(() => ({}));
      mediaId = body.id ? Number(body.id) : undefined;
      mediaType = body.mediaType;
    }

    if (!mediaId || !mediaType) {
      return NextResponse.json(
        { success: false, error: 'id and mediaType parameters are required' },
        { status: 400 }
      );
    }

    const db = getDatabase();
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND media_id = ? AND media_type = ?').run(
      user.userId,
      mediaId,
      mediaType
    );

    return NextResponse.json({ success: true, isAdded: false });
  } catch (err: any) {
    console.error('Favorites DELETE error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Backward-compatible POST alias for legacy clients
export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => ({}));
  if (body?.action === 'delete') {
    return DELETE(request);
  }
  return PUT(request);
}
