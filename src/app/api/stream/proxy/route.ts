import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const TORRSERVER_INTERNAL_URL = (process.env.TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  // Rate limiting (120 / min / IP accommodating chunked Range requests)
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`stream-proxy:${clientIp}`, 120, 60000);
  if (!rateLimit.success) {
    return new NextResponse('Too many stream proxy requests', {
      status: 429,
      headers: { 'Retry-After': Math.ceil(rateLimit.resetMs / 1000).toString() },
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawLink = searchParams.get('link');
    const rawIndex = searchParams.get('index') || '1';
    const rawTitle = searchParams.get('title') || 'video';

    if (!rawLink || rawLink.trim().length === 0 || rawLink.length > 4096) {
      return new NextResponse('Invalid or missing link parameter', { status: 400 });
    }
    const link = rawLink.trim();

    const parsedIndex = parseInt(rawIndex, 10);
    if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex > 100000) {
      return new NextResponse('index must be a non-negative integer', { status: 400 });
    }

    const cleanTitle = rawTitle.slice(0, 256).replace(/[\r\n\0]/g, '').trim() || 'video';

    // Assemble upstream URL safely via URLSearchParams
    const torrParams = new URLSearchParams();
    torrParams.set('link', link);
    torrParams.set('index', parsedIndex.toString());
    torrParams.set('play', '');
    const torrUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(cleanTitle)}?${torrParams.toString()}`;

    // Forward range header for browser seeking
    const range = request.headers.get('range');
    const headers: Record<string, string> = {};
    if (range) {
      headers['Range'] = range;
    }

    // Connect with client abort propagation
    const controller = new AbortController();
    const onClientAbort = () => controller.abort();
    request.signal.addEventListener('abort', onClientAbort, { once: true });

    let res: Response;
    try {
      res = await fetch(torrUrl, {
        headers,
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      request.signal.removeEventListener('abort', onClientAbort);
      if (request.signal.aborted) {
        return new NextResponse(null, { status: 499 });
      }
      throw fetchErr;
    }

    const responseHeaders = new Headers();
    const copyHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
    ];

    copyHeaders.forEach((h) => {
      const val = res.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    return new NextResponse(res.body as any, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    if (request.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    console.error('Proxy streaming error:', error);
    return new NextResponse('Streaming proxy failed', { status: 502 });
  }
}
