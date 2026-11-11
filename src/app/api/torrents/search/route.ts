import { NextRequest, NextResponse } from 'next/server';
import { jackett } from '@/lib/jackett';
import { TorrentItem } from '@/types/torrent';

export const dynamic = 'force-dynamic';

function deduplicateTorrents(groups: TorrentItem[][]): TorrentItem[] {
  const seen = new Set<string>();
  const merged: TorrentItem[] = [];

  for (const list of groups) {
    // Keep highest-seeder items first within each priority group
    const sorted = [...list].sort((a, b) => b.seeders - a.seeders);
    for (const item of sorted) {
      const dedupeKey = (item.magnetUrl || item.link || item.title).toLowerCase().trim();
      if (!seen.has(dedupeKey)) {
        seen.add(dedupeKey);
        merged.push(item);
      }
    }
  }

  return merged;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim();
    const year = searchParams.get('year') || undefined;
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!query) {
      return NextResponse.json({ success: false, error: 'Query parameter "q" is required' }, { status: 400 });
    }

    let items: TorrentItem[] = [];
    let primaryQuery = query;

    if (season && episode) {
      const s = season.padStart(2, '0');
      const e = episode.padStart(2, '0');
      const epQuery = `${query} s${s}e${e}`;
      const seasonQuery = `${query} s${s}`;
      primaryQuery = epQuery;

      // Run episode, season, and full-series searches concurrently (~3-4x faster than sequential fallback)
      const [epResults, seasonResults, baseResults] = await Promise.all([
        jackett.search(epQuery),
        jackett.search(seasonQuery),
        jackett.search(query),
      ]);

      items = deduplicateTorrents([epResults, seasonResults, baseResults]);
    } else if (year) {
      // Run year-filtered and plain-title searches concurrently
      const [yearResults, plainResults] = await Promise.all([
        jackett.search(query, year),
        jackett.search(query),
      ]);

      items = deduplicateTorrents([yearResults, plainResults]);
    } else {
      items = await jackett.search(query);
    }

    return NextResponse.json({
      success: true,
      query: primaryQuery,
      count: items.length,
      items,
    });
  } catch (error: any) {
    console.error('API Error in /api/torrents/search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
