import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TORRSERVER_INTERNAL_URL = process.env.TORRSERVER_URL || 'http://localhost:8090';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const link = searchParams.get('link');
    const index = searchParams.get('index') || '1';
    const title = searchParams.get('title') || 'video';

    if (!link) {
      return new NextResponse('Missing link parameter', { status: 400 });
    }

    const torrUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(title)}?link=${link}&index=${index}&play`;

    // Forward range header for video seeking
    const range = request.headers.get('range');
    const headers: Record<string, string> = {};
    if (range) {
      headers['Range'] = range;
    }

    const res = await fetch(torrUrl, {
      headers,
      cache: 'no-store',
    });

    const responseHeaders = new Headers();
    const copyHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'content-disposition',
    ];

    copyHeaders.forEach((h) => {
      const val = res.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(res.body as any, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('Proxy streaming error:', error);
    return new NextResponse('Streaming proxy failed', { status: 502 });
  }
}
