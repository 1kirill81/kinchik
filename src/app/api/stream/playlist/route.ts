import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TORRSERVER_PUBLIC_URL = (process.env.NEXT_PUBLIC_TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const link = searchParams.get('link');
    const index = searchParams.get('index') || '1';
    const title = searchParams.get('title') || 'video';

    if (!link) {
      return new NextResponse('Missing link parameter', { status: 400 });
    }

    const cleanTitle = encodeURIComponent(title.replace(/[\\/:*?"<>|]/g, ''));
    const streamUrl = `${TORRSERVER_PUBLIC_URL}/stream/${cleanTitle}?link=${link}&index=${index}&play`;

    const m3uContent = `#EXTM3U\n#EXTINF:-1,${title}\n${streamUrl}\n`;

    return new NextResponse(m3uContent, {
      status: 200,
      headers: {
        'Content-Type': 'audio/x-mpegurl',
        'Content-Disposition': `attachment; filename="${cleanTitle || 'stream'}.m3u"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    return new NextResponse(error.message || 'Playlist generation failed', { status: 500 });
  }
}
