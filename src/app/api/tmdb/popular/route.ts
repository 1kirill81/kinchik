import { NextRequest, NextResponse } from 'next/server';
import { tmdb } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'movie';
    const page = parseInt(searchParams.get('page') || '1', 10);

    const items = type === 'tv' ? await tmdb.getPopularTV(page) : await tmdb.getPopularMovies(page);

    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error('API Error in /api/tmdb/popular:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
