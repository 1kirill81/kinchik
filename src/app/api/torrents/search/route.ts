import { NextRequest, NextResponse } from 'next/server';
import { jackett } from '@/lib/jackett';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const year = searchParams.get('year') || undefined;
    const season = searchParams.get('season');
    const episode = searchParams.get('episode');

    if (!query) {
      return NextResponse.json({ success: false, error: 'Query parameter "q" is required' }, { status: 400 });
    }

    let searchQuery = query;

    // TV Episode specific search refinement
    if (season && episode) {
      const s = season.padStart(2, '0');
      const e = episode.padStart(2, '0');
      searchQuery = `${query} s${s}e${e}`;
    }

    // 1. Try search
    let items = await jackett.search(searchQuery, year);

    // 2. If empty and year was specified, retry without year (trackers often use year ranges like 2005-2020)
    if (items.length === 0 && year) {
      items = await jackett.search(searchQuery);
    }

    // 3. If specific episode search returned no results, try season search (e.g. "Series S01")
    if (items.length === 0 && season && episode) {
      const s = season.padStart(2, '0');
      items = await jackett.search(`${query} s${s}`);
    }

    // 4. If still empty, search plain title
    if (items.length === 0 && query !== searchQuery) {
      items = await jackett.search(query);
    }

    return NextResponse.json({
      success: true,
      query: searchQuery,
      count: items.length,
      items,
    });
  } catch (error: any) {
    console.error('API Error in /api/torrents/search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
