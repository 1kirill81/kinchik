import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import { probeTorrentMedia } from '@/lib/ffprobe';
import { Semaphore } from '@/lib/semaphore';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const TORRSERVER_INTERNAL_URL = (process.env.TORRSERVER_URL || 'http://localhost:8090').replace(/\/+$/, '');

// Clamp MAX_REMUX_CONCURRENCY to [1, 4], default 2
const rawConcurrency = parseInt(process.env.MAX_REMUX_CONCURRENCY || '2', 10);
const MAX_CONCURRENCY = Math.max(1, Math.min(4, isNaN(rawConcurrency) ? 2 : rawConcurrency));
const remuxSemaphore = new Semaphore(MAX_CONCURRENCY);

const MAX_REMUX_RUNTIME_MS = 4 * 60 * 60 * 1000; // 4 hours maximum runtime
const MAX_STDERR_LOG_BYTES = 64 * 1024; // 64 KB capped stderr logging

export async function GET(request: NextRequest) {
  // 1. IP Rate Limiting (~10 requests / min / IP)
  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`remux:${clientIp}`, 10, 60000);
  if (!rateLimit.success) {
    return new NextResponse('Too many remux requests, please slow down.', {
      status: 429,
      headers: {
        'Retry-After': Math.ceil(rateLimit.resetMs / 1000).toString(),
      },
    });
  }

  // 2. Strict Input Validation
  const { searchParams } = new URL(request.url);
  const rawLink = searchParams.get('link');
  const rawIndex = searchParams.get('index') || '1';
  const rawTitle = searchParams.get('title') || 'video';
  const rawStartTime = searchParams.get('startTime') || '0';
  const requestedAudio = searchParams.get('audio');

  if (!rawLink || rawLink.trim().length === 0 || rawLink.length > 4096) {
    return new NextResponse('Invalid or missing link parameter', { status: 400 });
  }
  const link = rawLink.trim();

  const parsedIndex = parseInt(rawIndex, 10);
  if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex > 100000) {
    return new NextResponse('Index must be a non-negative integer', { status: 400 });
  }

  const seekSeconds = parseFloat(rawStartTime);
  if (isNaN(seekSeconds) || !isFinite(seekSeconds) || seekSeconds < 0 || seekSeconds > 86400) {
    return new NextResponse('startTime must be a finite non-negative number within 24 hours', {
      status: 400,
    });
  }

  const cleanTitle = rawTitle.slice(0, 256).replace(/[\r\n\0]/g, '').trim() || 'video';

  // 3. Acquire Semaphore Slot
  const releasePermit = remuxSemaphore.tryAcquire();
  if (!releasePermit) {
    return new NextResponse('Server transcoding capacity reached. Please try again shortly.', {
      status: 503,
      headers: {
        'Retry-After': '5',
      },
    });
  }

  let isPermitReleased = false;
  const safeRelease = () => {
    if (!isPermitReleased) {
      isPermitReleased = true;
      releasePermit();
    }
  };

  let ffmpegProc: ChildProcess | null = null;
  let runtimeTimer: ReturnType<typeof setTimeout> | null = null;

  const killFfmpeg = () => {
    if (runtimeTimer) {
      clearTimeout(runtimeTimer);
      runtimeTimer = null;
    }
    if (ffmpegProc) {
      try {
        ffmpegProc.kill('SIGKILL');
      } catch {}
      ffmpegProc = null;
    }
    safeRelease();
  };

  try {
    // 4. Assemble TorrServer upstream URL safely using URLSearchParams
    const torrParams = new URLSearchParams();
    torrParams.set('link', link);
    torrParams.set('index', parsedIndex.toString());
    torrParams.set('play', '');
    const torrUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(cleanTitle)}?${torrParams.toString()}`;

    // 5. Media Probe (codecs, duration, audio tracks)
    const probeInfo = await probeTorrentMedia(link, parsedIndex, cleanTitle, 4500);

    let isH264 = probeInfo.isH264;
    if (probeInfo.videoStreamIndex === null) {
      if (cleanTitle.toLowerCase().endsWith('.avi') || link.toLowerCase().includes('.avi')) {
        isH264 = false;
      }
    }

    const videoStreamIndex =
      probeInfo.videoStreamIndex !== null ? `0:${probeInfo.videoStreamIndex}` : '0:v:0';

    let chosenAudioStream: number | null = probeInfo.defaultAudioIndex;
    if (requestedAudio !== null && requestedAudio !== '') {
      const parsedAudio = parseInt(requestedAudio, 10);
      if (!isNaN(parsedAudio) && parsedAudio >= 0) {
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

    if (seekSeconds > 0) {
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
      ffmpegArgs.push('-c:v', 'copy');
    } else {
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

    // 6. Spawn FFmpeg with stdio ['ignore', 'pipe', 'pipe']
    ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Enforce maximum execution runtime
    runtimeTimer = setTimeout(() => {
      console.warn(`[FFmpeg Remux] Exceeded maximum runtime ${MAX_REMUX_RUNTIME_MS}ms, terminating.`);
      killFfmpeg();
    }, MAX_REMUX_RUNTIME_MS);

    // Cancel on client disconnection
    request.signal.addEventListener('abort', () => {
      killFfmpeg();
    });

    let stderrBytes = 0;
    ffmpegProc.stderr?.on('data', (data: Buffer) => {
      if (stderrBytes < MAX_STDERR_LOG_BYTES) {
        stderrBytes += data.length;
        console.warn('FFmpeg remux:', data.toString('utf8'));
      }
    });

    let isStreamEnded = false;

    const stream = new ReadableStream({
      start(controller) {
        if (!ffmpegProc || !ffmpegProc.stdout) {
          killFfmpeg();
          controller.close();
          return;
        }

        ffmpegProc.stdout.on('data', (chunk: Buffer) => {
          if (isStreamEnded) return;
          try {
            controller.enqueue(chunk);
          } catch {
            isStreamEnded = true;
            killFfmpeg();
          }
        });

        ffmpegProc.stdout.on('end', () => {
          if (isStreamEnded) return;
          isStreamEnded = true;
          killFfmpeg();
          try {
            controller.close();
          } catch {}
        });

        ffmpegProc.on('error', (err) => {
          console.error('FFmpeg process error:', err);
          if (isStreamEnded) return;
          isStreamEnded = true;
          killFfmpeg();
          try {
            controller.error(err);
          } catch {}
        });

        ffmpegProc.on('close', () => {
          if (!isStreamEnded) {
            isStreamEnded = true;
            killFfmpeg();
            try {
              controller.close();
            } catch {}
          }
        });
      },
      cancel() {
        isStreamEnded = true;
        killFfmpeg();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Remux-Stream': 'active',
      },
    });
  } catch (error: any) {
    killFfmpeg();
    console.error('API Error in /api/stream/remux:', error);
    return new NextResponse(error.message || 'Remux failed', { status: 500 });
  }
}
