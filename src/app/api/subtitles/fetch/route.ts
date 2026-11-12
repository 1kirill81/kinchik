import { NextRequest, NextResponse } from 'next/server';
import { decodeSubtitleBytes } from '@/lib/utils';
import { fetchWithTimeout } from '@/lib/http';

export const dynamic = 'force-dynamic';

const TORRSERVER_INTERNAL_URL = (process.env.TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');
const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024; // 5 MB safety cap
const MAX_REDIRECTS = 3;

function isPrivateIpOrHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '0.0.0.0') {
    return true;
  }
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const p1 = parseInt(ipv4Match[1], 10);
    const p2 = parseInt(ipv4Match[2], 10);
    if (p1 === 10) return true;
    if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
    if (p1 === 192 && p2 === 168) return true;
    if (p1 === 169 && p2 === 254) return true;
    if (p1 === 127 || p1 === 0) return true;
  }
  return false;
}

function isAllowedRemoteSubtitleUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateIpOrHost(host)) return false;

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

async function fetchRemoteWithSafeRedirects(initialUrl: string): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedRemoteSubtitleUrl(currentUrl)) {
      throw new Error(`Redirect target not allowed: ${currentUrl}`);
    }

    const res = await fetchWithTimeout(
      currentUrl,
      {
        redirect: 'manual',
        headers: { 'User-Agent': 'KinoStream/1.0' },
      },
      10000
    );

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        throw new Error('Redirect response missing Location header');
      }
      currentUrl = new URL(loc, currentUrl).toString();
      continue;
    }

    return res;
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const remoteUrl = searchParams.get('url');
    const hash = searchParams.get('hash');
    const index = searchParams.get('index');
    const title = searchParams.get('title') || searchParams.get('name') || 'subtitle.srt';

    let res: Response;

    if (hash && index) {
      const parsedIndex = parseInt(index, 10);
      if (isNaN(parsedIndex) || parsedIndex < 0) {
        return new NextResponse('Invalid index parameter', { status: 400 });
      }

      const torrUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(title)}?link=${encodeURIComponent(hash)}&index=${parsedIndex}&play`;
      res = await fetchWithTimeout(torrUrl, { cache: 'no-store' }, 10000);
    } else if (remoteUrl) {
      if (!isAllowedRemoteSubtitleUrl(remoteUrl)) {
        return new NextResponse('Subtitle host not allowed', { status: 400 });
      }
      res = await fetchRemoteWithSafeRedirects(remoteUrl);
    } else {
      return new NextResponse('Missing subtitle source parameters', { status: 400 });
    }

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
        'Cache-Control': hash ? 'no-store' : 'public, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Subtitle fetch proxy error:', error);
    return new NextResponse(error.message || 'Subtitle fetch failed', { status: 502 });
  }
}
