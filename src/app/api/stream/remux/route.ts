import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

const TORRSERVER_INTERNAL_URL = process.env.TORRSERVER_URL || 'http://localhost:8090';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const link = searchParams.get('link');
    const index = searchParams.get('index') || '1';
    const title = searchParams.get('title') || 'video';
    const startTime = searchParams.get('startTime') || '0';

    if (!link) {
      return new NextResponse('Missing link parameter', { status: 400 });
    }

    const torrUrl = `${TORRSERVER_INTERNAL_URL}/stream/${encodeURIComponent(title)}?link=${link}&index=${index}&play`;

    // 1. Probe video & audio streams with ffprobe (timeout 3.5s)
    let isH264 = true;
    let videoStreamIndex = 'v:0';
    let audioStreamIndex: string | null = null;

    try {
      const probeJson = await new Promise<any>((resolve) => {
        const proc = spawn('ffprobe', [
          '-v', 'error',
          '-analyzeduration', '15000000',
          '-probesize', '15000000',
          '-show_streams',
          '-of', 'json',
          torrUrl,
        ]);
        let out = '';
        proc.stdout.on('data', (d) => (out += d.toString()));
        proc.on('close', () => {
          try {
            resolve(JSON.parse(out));
          } catch {
            resolve(null);
          }
        });
        proc.on('error', () => resolve(null));
        setTimeout(() => {
          try { proc.kill(); } catch {}
          resolve(null);
        }, 3500);
      });

      if (probeJson && Array.isArray(probeJson.streams)) {
        const streams: any[] = probeJson.streams;
        const vStream = streams.find((s) => s.codec_type === 'video');
        if (vStream) {
          videoStreamIndex = `0:${vStream.index}`;
          const cName = (vStream.codec_name || '').toLowerCase();
          if (!cName.includes('h264') && !cName.includes('avc')) {
            isH264 = false;
          }
        }

        const aStreams = streams.filter((s) => s.codec_type === 'audio');
        if (aStreams.length > 0) {
          // Priority 1: Russian audio track (LostFilm, Dub, MVO, rus)
          const rusTrack = aStreams.find((s) => {
            const lang = (s.tags?.language || '').toLowerCase();
            const trackTitle = (s.tags?.title || '').toLowerCase();
            return (
              lang.includes('rus') ||
              lang.includes('ru') ||
              trackTitle.includes('rus') ||
              trackTitle.includes('рус') ||
              trackTitle.includes('дубл') ||
              trackTitle.includes('lostfilm') ||
              trackTitle.includes('кубик') ||
              trackTitle.includes('mvo') ||
              trackTitle.includes('dvo')
            );
          });

          const chosenAudio = rusTrack || aStreams[0];
          audioStreamIndex = `0:${chosenAudio.index}`;
        }
      }
    } catch {
      // Fallback: check file extension in title or link
      if (title.toLowerCase().endsWith('.avi') || link.toLowerCase().includes('.avi')) {
        isH264 = false;
      }
    }

    const ffmpegArgs: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-analyzeduration', '25000000',
      '-probesize', '25000000',
    ];

    const seekSeconds = parseFloat(startTime);
    if (!isNaN(seekSeconds) && seekSeconds > 0) {
      ffmpegArgs.push('-ss', seekSeconds.toString());
    }

    ffmpegArgs.push(
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', torrUrl,
      '-map', videoStreamIndex
    );

    // Map audio: explicitly mapped if probed, or 0:a:0 fallback
    if (audioStreamIndex) {
      ffmpegArgs.push('-map', audioStreamIndex);
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
      '-af', 'aresample=matrix_encoding=dplii,volume=1.4',
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
