import { NextRequest, NextResponse } from 'next/server';
import { decodeSubtitleBytes } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TORRSERVER_INTERNAL_URL = (process.env.TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');
const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024; // 5 MB safety cap

function isAllowedRemoteSubtitleUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.strem.io') ||
      host.endsWith('.opensubtitles.org') ||
      host.endsWith('.opensubtitles.com') ||
      host === 'strem.io' ||
      host === 'opensubtitles.org' ||
      host === 'opensubtitles.com'
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const remoteUrl = searchParams.get('url');
    const hash = searchParams.get('hash');
    const index = searchParams.get('index');
    const title = searchParams.get('title') || searchParams.get('name') || 'subtitle.srt';

    let targetUrl: string;
    if (hash && index) {
      targetUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(title)}?link=${encodeURIComponent(hash)}&index=${encodeURIComponent(index)}&play`;
    } else if (remoteUrl) {
      if (!isAllowedRemoteSubtitleUrl(remoteUrl)) {
        return new NextResponse('Subtitle host not allowed', { status: 400 });
      }
      targetUrl = remoteUrl;
    } else {
      return new NextResponse('Missing subtitle source parameters', { status: 400 });
    }

    const res = await fetch(targetUrl, {
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'KinoStream/1.0',
      },
    });

    if (!res.ok) {
      return new NextResponse(`Failed to fetch subtitle: ${res.status}`, { status: 502 });
    }

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_SUBTITLE_BYTES) {
      return new NextResponse('Subtitle file too large', { status: 413 });
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_SUBTITLE_BYTES) {
      return new NextResponse('Subtitle file too large', { status: 413 });
    }

    const text = decodeSubtitleBytes(new Uint8Array(buffer));
    const isVtt = title.toLowerCase().endsWith('.vtt') || text.trimStart().startsWith('WEBVTT');

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': isVtt ? 'text/vtt; charset=utf-8' : 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': hash ? 'no-store' : 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Subtitle fetch proxy error:', error);
    return new NextResponse('Subtitle fetch failed', { status: 502 });
  }
}
