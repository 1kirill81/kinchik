import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get('path');
    const size = searchParams.get('size') || 'w500';

    if (!path) {
      return new NextResponse('Path parameter is required', { status: 400 });
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const imageUrl = `${TMDB_IMAGE_BASE_URL}/${size}${cleanPath}`;

    const res = await fetch(imageUrl, {
      next: { revalidate: 86400 }, // Cache images for 24h
    });

    if (!res.ok) {
      return new NextResponse('Image not found', { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = await res.arrayBuffer();

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
