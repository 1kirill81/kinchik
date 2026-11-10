import { NextRequest, NextResponse } from 'next/server';
import { torrserver, isVideoFile } from '@/lib/torrserver';
import { formatBytes } from '@/lib/utils';
import { StreamPrepareRequest, StreamPrepareResponse } from '@/types/torrent';

export async function POST(request: NextRequest) {
  try {
    const body: StreamPrepareRequest = await request.json();
    const { link, title, poster, fileIndex, season, episode } = body;

    if (!link || !title) {
      return NextResponse.json(
        { success: false, error: 'Torrent link and title are required' },
        { status: 400 }
      );
    }

    // 1. Check TorrServer connectivity
    const isOnline = await torrserver.ping();
    if (!isOnline) {
      return NextResponse.json(
        {
          success: false,
          error: 'TorrServer is offline or unreachable. Please check your TorrServer container / service.',
        },
        { status: 503 }
      );
    }

    // 2. Add torrent to TorrServer
    const addedTorrent = await torrserver.addTorrent(link, title, poster);
    const hash = addedTorrent.hash;

    if (!hash) {
      return NextResponse.json(
        { success: false, error: 'TorrServer failed to parse torrent hash' },
        { status: 500 }
      );
    }

    // 3. Wait for TorrServer to fetch file list from DHT / peers
    const torrentWithFiles = await torrserver.getTorrentWithFiles(hash);
    const files = torrentWithFiles.file_stats || [];

    if (files.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Torrent metadata loaded, but no files found. Torrent may have 0 peers.',
        },
        { status: 404 }
      );
    }

    // 4. Select video file
    let selectedFile = null;

    if (typeof fileIndex === 'number') {
      selectedFile = files.find((f) => f.id === fileIndex) || null;
    }

    if (!selectedFile) {
      selectedFile = torrserver.selectBestVideoFile(files, season, episode);
    }

    if (!selectedFile) {
      selectedFile = files[0];
    }

    // 5. Preload buffer
    await torrserver.preloadTorrent(hash, selectedFile.id);

    // 6. Build streaming URL
    const streamUrl = torrserver.buildStreamUrl(hash, selectedFile.id, title);

    const formattedFiles = files.map((f) => ({
      id: f.id,
      path: f.path,
      length: f.length,
      formattedSize: formatBytes(f.length),
      isVideo: isVideoFile(f.path),
    }));

    const response: StreamPrepareResponse = {
      hash,
      title,
      fileIndex: selectedFile.id,
      fileName: selectedFile.path,
      fileSize: selectedFile.length,
      formattedFileSize: formatBytes(selectedFile.length),
      streamUrl,
      files: formattedFiles,
    };

    return NextResponse.json({ success: true, ...response });
  } catch (error: any) {
    console.error('API Error in /api/stream/prepare:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to prepare stream' },
      { status: 500 }
    );
  }
}
