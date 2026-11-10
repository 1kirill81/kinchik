import { NextRequest, NextResponse } from 'next/server';
import { torrserver } from '@/lib/torrserver';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hash = searchParams.get('hash');

    if (!hash) {
      return NextResponse.json({ success: false, error: 'Hash is required' }, { status: 400 });
    }

    const stats = await torrserver.getLiveStats(hash);

    if (!stats) {
      return NextResponse.json({ success: false, error: 'Torrent stats not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, stats });
  } catch (error: any) {
    console.error('API Error in /api/stream/stats:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
