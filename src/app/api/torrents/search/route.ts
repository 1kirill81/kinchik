import { NextRequest, NextResponse } from 'next/server';
import { jackett, mergeUniqueTorrents } from '@/lib/jackett';
import { TorrentItem } from '@/types/torrent';

export const dynamic = 'force-dynamic';

function scoreTorrentRelevance(
  item: TorrentItem,
  opts: { query?: string; altQuery?: string; year?: string; season?: number; episode?: number }
): number {
  const title = item.title.toLowerCase();
  let score = 0;

  if (item.seeders > 0) {
    score += 250;
  }

  const queries = [opts.query, opts.altQuery]
    .filter((q): q is string => Boolean(q && q.trim().length >= 2))
    .map((q) => q.trim().toLowerCase());
  if (queries.some((q) => title.includes(q))) {
    score += 80;
  }

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

  if (opts.year) {
    if (title.includes(opts.year)) {
      score += 150;
    } else {
      const targetYear = parseInt(opts.year, 10);
      const hasSeasonTag = /\bs0?\d{1,2}\b|season\s*\d+|сезон\s*\d+/i.test(title);
      if (!hasSeasonTag && Number.isFinite(targetYear)) {
        const yearMatches = title.match(/(?:\(|\[|\b)(19\d{2}|20\d{2})(?:\)|\]|\b)/g);
        if (yearMatches && yearMatches.length > 0) {
          const parsedYears = yearMatches.map((m) => parseInt(m.replace(/\D/g, ''), 10));
          const closeMatch = parsedYears.some((y) => Math.abs(y - targetYear) <= 1);
          if (!closeMatch) {
            score -= 400;
          }
        }
      }
    }
  }

  return score;
}

function rankTorrents(
  items: TorrentItem[],
  opts: { query?: string; altQuery?: string; year?: string; season?: number; episode?: number }
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
    const rawAltQuery = searchParams.get('altQuery')?.trim();
    const altQuery =
      rawAltQuery && query && rawAltQuery.toLowerCase() !== query.toLowerCase()
        ? rawAltQuery
        : undefined;
    const year = searchParams.get('year') || undefined;
    const seasonParam = searchParams.get('season');
    const episodeParam = searchParams.get('episode');
    const season = seasonParam ? parseInt(seasonParam, 10) : undefined;
    const episode = episodeParam ? parseInt(episodeParam, 10) : undefined;

    if (!query) {
      return NextResponse.json({ success: false, error: 'Query parameter "q" is required' }, { status: 400 });
    }

    const searchQueries = [query];
    if (altQuery) searchQueries.push(altQuery);

    const settled = await Promise.allSettled(
      searchQueries.map((qText) =>
        year && qText.length < 5 && !season ? jackett.search(qText, year) : jackett.search(qText)
      )
    );

    const fulfilledLists: TorrentItem[][] = [];
    let firstError: unknown = null;
    for (const res of settled) {
      if (res.status === 'fulfilled') {
        fulfilledLists.push(res.value);
      } else if (!firstError) {
        firstError = res.reason;
      }
    }

    if (fulfilledLists.length === 0 && firstError) {
      throw firstError;
    }

    let items = mergeUniqueTorrents(fulfilledLists);

    // Fallback: if single-query series title returned nothing, try appending SxxExx
    if (items.length === 0 && season && episode) {
      const s = String(season).padStart(2, '0');
      const e = String(episode).padStart(2, '0');
      items = await jackett.search(`${query} s${s}e${e}`);
    } else if (items.length === 0 && year && query.length < 5) {
      items = await jackett.search(query);
    }

    const rankedItems = rankTorrents(items, { query, altQuery, year, season, episode });

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
