import { NextRequest, NextResponse } from 'next/server';
import { tmdb } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mediaType = (searchParams.get('mediaType') as 'all' | 'movie' | 'tv') || 'all';
    const timeWindow = (searchParams.get('timeWindow') as 'day' | 'week') || 'day';

    const items = await tmdb.getTrending(mediaType, timeWindow);
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error('API Error in /api/tmdb/trending:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
