import { NextRequest, NextResponse } from 'next/server';
import { probeTorrentMedia } from '@/lib/ffprobe';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const link = searchParams.get('link');
    const index = searchParams.get('index') || '1';
    const title = searchParams.get('title') || 'video';

    if (!link) {
      return NextResponse.json(
        { success: false, error: 'Missing link parameter' },
        { status: 400 }
      );
    }

    const info = await probeTorrentMedia(link, index, title, 8000);

    return NextResponse.json({
      success: true,
      ...info,
    });
  } catch (error: any) {
    console.error('API Error in /api/stream/info:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to probe stream info' },
      { status: 500 }
    );
  }
}
