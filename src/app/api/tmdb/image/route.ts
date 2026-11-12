import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http';

export const dynamic = 'force-dynamic';

const TMDB_IMAGE_BASE_URL = (process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p').replace(/\/+$/, '');
const ALLOWED_SIZES = new Set(['w300', 'w500', 'w780', 'w1280', 'original']);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB limit

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const size = searchParams.get('size') || 'w500';

    if (!path) {
      return new NextResponse('Path parameter is required', { status: 400 });
    }

    if (!ALLOWED_SIZES.has(size)) {
      return new NextResponse('Invalid image size parameter', { status: 400 });
    }

    // Path must be a safe TMDB poster path like /abc123xyz.jpg
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    if (!/^\/[a-zA-Z0-9_\-./]+\.(jpg|jpeg|png|webp|svg)$/i.test(cleanPath) || cleanPath.includes('..')) {
      return new NextResponse('Invalid image path format', { status: 400 });
    }

    const imageUrl = `${TMDB_IMAGE_BASE_URL}/${size}${cleanPath}`;

    const res = await fetchWithTimeout(imageUrl, { cache: 'no-store' }, 8000);

    if (!res.ok) {
      return new NextResponse('Image not found', { status: res.status });
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      return new NextResponse('Invalid content type received from upstream', { status: 502 });
    }

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMAGE_BYTES) {
      return new NextResponse('Image size exceeds limit', { status: 413 });
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return new NextResponse('Image size exceeds limit', { status: 413 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error: any) {
    console.error('Image proxy error:', error);
    return new NextResponse('Failed to proxy image', { status: 502 });
  }
}
