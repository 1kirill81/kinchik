import { describe, it, expect } from 'vitest';
import { torrserver } from '@/lib/torrserver';
import { TorrServerFile } from '@/types/torrent';

describe('TorrServer File Selection Logic', () => {
  const files: TorrServerFile[] = [
    { id: 1, path: 'Supernatural.S01E01.Pilot.mkv', length: 1500000000 },
    { id: 2, path: 'Supernatural.S01E02.Wendigo.mkv', length: 1600000000 },
    { id: 3, path: 'Supernatural.S01E03.Dead in the Water.mkv', length: 1550000000 },
    { id: 4, path: 'Sample/sample.mkv', length: 20000000 },
    { id: 5, path: 'Subs/s01e01.srt', length: 50000 },
  ];

  it('selects the exact episode file matching season and episode', () => {
    const selected = torrserver.selectBestVideoFile(files, 1, 2);
    expect(selected?.id).toBe(2);
    expect(selected?.path).toContain('S01E02');
  });

  it('selects largest non-sample video file for movie releases', () => {
    const movieFiles: TorrServerFile[] = [
      { id: 1, path: 'Feature Film 1080p.mkv', length: 8500000000 },
      { id: 2, path: 'Trailer/sample.mkv', length: 50000000 },
      { id: 3, path: 'Extras/interview.mkv', length: 400000000 },
    ];

    const selected = torrserver.selectBestVideoFile(movieFiles);
    expect(selected?.id).toBe(1);
    expect(selected?.length).toBe(8500000000);
  });
});
