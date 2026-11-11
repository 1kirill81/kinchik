import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { probeTorrentMedia } from '@/lib/ffprobe';

export const dynamic = 'force-dynamic';

const TORRSERVER_INTERNAL_URL = (process.env.TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const link = searchParams.get('link');
    const index = searchParams.get('index') || '1';
    const title = searchParams.get('title') || 'video';
    const startTime = searchParams.get('startTime') || '0';
    const requestedAudio = searchParams.get('audio');

    if (!link) {
      return new NextResponse('Missing link parameter', { status: 400 });
    }

    const torrUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(title)}?link=${link}&index=${index}&play`;

    // 1. Get cached or fresh media metadata (video codec & audio tracks)
    const probeInfo = await probeTorrentMedia(link, index, title, 4500);

    let isH264 = probeInfo.isH264;
    if (probeInfo.videoStreamIndex === null) {
      // Fallback if probe timed out
      if (title.toLowerCase().endsWith('.avi') || link.toLowerCase().includes('.avi')) {
        isH264 = false;
      }
    }

    const videoStreamIndex = probeInfo.videoStreamIndex !== null ? `0:${probeInfo.videoStreamIndex}` : '0:v:0';

    let chosenAudioStream: number | null = probeInfo.defaultAudioIndex;
    if (requestedAudio !== null && requestedAudio !== '') {
      const parsedAudio = parseInt(requestedAudio, 10);
      if (!isNaN(parsedAudio)) {
        // Verify if probed tracks contain this index, or trust numeric index if probe failed
        const matchesProbed =
          probeInfo.audioTracks.length === 0 ||
          probeInfo.audioTracks.some((t) => t.index === parsedAudio);
        if (matchesProbed) {
          chosenAudioStream = parsedAudio;
        }
      }
    }

    const ffmpegArgs: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-analyzeduration', '20000000',
      '-probesize', '20000000',
    ];

    const seekSeconds = parseFloat(startTime);
    if (!isNaN(seekSeconds) && seekSeconds > 0) {
      ffmpegArgs.push('-ss', seekSeconds.toString());
    }

    ffmpegArgs.push(
      '-seekable', '1',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', torrUrl,
      '-map', videoStreamIndex
    );

    if (chosenAudioStream !== null) {
      ffmpegArgs.push('-map', `0:${chosenAudioStream}`);
    } else {
      ffmpegArgs.push('-map', '0:a:0?');
    }

    if (isH264) {
      // Direct stream copy for native H.264 video (0% CPU load)
      ffmpegArgs.push('-c:v', 'copy');
    } else {
      // Transcode incompatible legacy/unsupported codecs (XviD, DivX, MPEG4, etc.) to browser-compatible H.264
      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-pix_fmt', 'yuv420p'
      );
    }

    ffmpegArgs.push(
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2',
      '-ar', '48000',
      '-af', 'aresample=async=1:matrix_encoding=dplii,volume=1.4',
      '-avoid_negative_ts', 'make_zero',
      '-max_muxing_queue_size', '4096',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1'
    );

    const ffmpegProc = spawn('ffmpeg', ffmpegArgs);

    let isClosed = false;

    const stream = new ReadableStream({
      start(controller) {
        ffmpegProc.stdout.on('data', (chunk: Buffer) => {
          if (isClosed) return;
          try {
            controller.enqueue(chunk);
          } catch {
            isClosed = true;
            ffmpegProc.kill('SIGKILL');
          }
        });

        ffmpegProc.stdout.on('end', () => {
          if (isClosed) return;
          isClosed = true;
          try {
            controller.close();
          } catch {}
        });

        ffmpegProc.on('error', (err) => {
          console.error('FFmpeg process spawn error:', err);
          if (isClosed) return;
          isClosed = true;
          try {
            controller.error(err);
          } catch {}
        });

        ffmpegProc.stderr.on('data', (data) => {
          console.warn('FFmpeg remux:', data.toString());
        });
      },
      cancel() {
        isClosed = true;
        ffmpegProc.kill('SIGKILL');
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
        'X-Remux-Stream': 'active',
      },
    });
  } catch (error: any) {
    console.error('API Error in /api/stream/remux:', error);
    return new NextResponse(error.message || 'Remux failed', { status: 500 });
  }
}
