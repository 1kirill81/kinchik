import { NextRequest, NextResponse } from 'next/server';
import { tmdb } from '@/lib/tmdb';

export async function GET(
  request: NextRequest,
  { params }: { params: { type: string; id: string } }
) {
  try {
    const { type, id } = params;

    if (type !== 'movie' && type !== 'tv') {
      return NextResponse.json({ success: false, error: 'Invalid media type' }, { status: 400 });
    }

    const details = await tmdb.getDetails(id, type);

    if (!details) {
      return NextResponse.json({ success: false, error: 'Media not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, details });
  } catch (error: any) {
    console.error('API Error in /api/tmdb/[type]/[id]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
