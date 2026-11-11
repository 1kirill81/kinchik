import { NextRequest, NextResponse } from 'next/server';
import { jackett } from '@/lib/jackett';
import { TorrentItem } from '@/types/torrent';

export const dynamic = 'force-dynamic';

function scoreTorrentRelevance(
  item: TorrentItem,
  opts: { year?: string; season?: number; episode?: number }
): number {
  const title = item.title.toLowerCase();
  let score = 0;

  if (opts.season && opts.episode) {
    const s = String(opts.season).padStart(2, '0');
    const e = String(opts.episode).padStart(2, '0');
    if (
      new RegExp(`s0?${opts.season}[\\s._-]*e0?${opts.episode}\\b`, 'i').test(title) ||
      new RegExp(`\\b${opts.season}x0?${opts.episode}\\b`, 'i').test(title) ||
      title.includes(`s${s}e${e}`)
    ) {
      score += 1000;
    } else if (
      new RegExp(`\\bs0?${opts.season}\\b|(сезон|season)\\s*0?${opts.season}\\b`, 'i').test(title)
    ) {
      score += 500;
    } else {
      // Check multi-season pack ranges e.g. "S1-15" or "1-15"
      const rangeMatch = title.match(/(?:s|сезон[ыа]?)?\s*0?(\d{1,2})\s*[-–]\s*0?(\d{1,2})/i);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        if (opts.season >= start && opts.season <= end) {
          score += 300;
        }
      }
    }
  }

  if (opts.year && title.includes(opts.year)) {
    score += 100;
  }

  return score;
}

function rankTorrents(
  items: TorrentItem[],
  opts: { year?: string; season?: number; episode?: number }
): TorrentItem[] {
  return [...items].sort((a, b) => {
    const scoreDiff = scoreTorrentRelevance(b, opts) - scoreTorrentRelevance(a, opts);
    if (scoreDiff !== 0) return scoreDiff;
    return b.seeders - a.seeders;
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const year = searchParams.get('year') || undefined;
    const seasonParam = searchParams.get('season');
    const episodeParam = searchParams.get('episode');
    const season = seasonParam ? parseInt(seasonParam, 10) : undefined;
    const episode = episodeParam ? parseInt(episodeParam, 10) : undefined;

    if (!query) {
      return NextResponse.json({ success: false, error: 'Query parameter "q" is required' }, { status: 400 });
    }

    let items: TorrentItem[] = [];

    // Use a single Jackett query to avoid overloading/rate-limiting trackers
    if (season && episode) {
      items = await jackett.search(query);
      if (items.length === 0) {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        items = await jackett.search(`${query} s${s}e${e}`);
      }
    } else if (year && query.length < 5) {
      // Very short movie titles (e.g. "Оно") benefit from year narrowing first
      items = await jackett.search(query, year);
      if (items.length === 0) {
        items = await jackett.search(query);
      }
    } else {
      items = await jackett.search(query);
    }

    const rankedItems = rankTorrents(items, { year, season, episode });

    return NextResponse.json({
      success: true,
      query,
      count: rankedItems.length,
      items: rankedItems,
    });
  } catch (error: any) {
    console.error('API Error in /api/torrents/search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
