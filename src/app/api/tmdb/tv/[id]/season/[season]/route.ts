import { NextRequest, NextResponse } from 'next/server';
import { tmdb } from '@/lib/tmdb';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; season: string } }
) {
  try {
    const { id, season } = params;
    const seasonNumber = parseInt(season, 10);

    const seasonDetails = await tmdb.getSeasonDetails(id, seasonNumber);

    if (!seasonDetails) {
      return NextResponse.json({ success: false, error: 'Season not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, season: seasonDetails });
  } catch (error: any) {
    console.error('API Error in /api/tmdb/tv/[id]/season/[season]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
