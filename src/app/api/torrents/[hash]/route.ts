import { NextRequest, NextResponse } from 'next/server';
import { torrserver } from '@/lib/torrserver';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;

    if (!hash) {
      return NextResponse.json({ success: false, error: 'Hash is required' }, { status: 400 });
    }

    const torrent = await torrserver.getTorrent(hash);

    if (!torrent) {
      return NextResponse.json({ success: false, error: 'Torrent not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, torrent });
  } catch (error: any) {
    console.error('API Error in /api/torrents/[hash]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
