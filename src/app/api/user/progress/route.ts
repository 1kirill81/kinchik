import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, upsertWatchProgress } from '@/lib/db';
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
    const p: Partial<WatchProgress> = await request.json().catch(() => ({}));

    // Strict validation
    if (!p.title || typeof p.title !== 'string' || p.title.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Valid title is required' }, { status: 400 });
    }

    if (!p.hash || typeof p.hash !== 'string' || p.hash.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Valid hash is required' }, { status: 400 });
    }

    if (p.mediaType !== 'movie' && p.mediaType !== 'tv') {
      return NextResponse.json({ success: false, error: 'mediaType must be movie or tv' }, { status: 400 });
    }

    const fileIndex = Number(p.fileIndex);
    if (!Number.isInteger(fileIndex) || fileIndex < 0) {
      return NextResponse.json({ success: false, error: 'fileIndex must be a non-negative integer' }, { status: 400 });
    }

    const currentTime = Number(p.currentTime);
    const duration = Number(p.duration);
    const progressPercent = Number(p.progressPercent);

    if (
      !Number.isFinite(currentTime) ||
      !Number.isFinite(duration) ||
      !Number.isFinite(progressPercent) ||
      isNaN(currentTime) ||
      isNaN(duration) ||
      isNaN(progressPercent) ||
      currentTime < 0 ||
      duration < 0 ||
      progressPercent < 0 ||
      progressPercent > 100
    ) {
      return NextResponse.json(
        { success: false, error: 'currentTime, duration, and progressPercent must be valid finite numbers' },
        { status: 400 }
      );
    }

    upsertWatchProgress({
      userId: user.userId,
      mediaId: p.mediaId ? Number(p.mediaId) : null,
      mediaType: p.mediaType,
      title: p.title.trim(),
      poster: p.poster || null,
      hash: p.hash.trim(),
      fileIndex,
      streamUrl: p.streamUrl || '',
      season: p.season ? Number(p.season) : null,
      episode: p.episode ? Number(p.episode) : null,
      episodeTitle: p.episodeTitle || null,
      currentTime,
      duration,
      progressPercent: Math.round(progressPercent),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving watch progress:', error);
    return NextResponse.json({ success: false, error: 'Failed to save progress' }, { status: 500 });
  }
}
