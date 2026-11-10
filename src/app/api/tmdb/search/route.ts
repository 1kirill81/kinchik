import { NextRequest, NextResponse } from 'next/server';
import { tmdb } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);

    if (!query.trim()) {
      return NextResponse.json({ success: true, items: [] });
    }

    const items = await tmdb.searchMulti(query, page);
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error('API Error in /api/tmdb/search:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
