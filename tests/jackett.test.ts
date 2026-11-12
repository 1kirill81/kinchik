import { describe, it, expect } from 'vitest';
import {
  parseTorrentTitle,
  extractTorrentLanguages,
  mergeUniqueTorrents,
} from '@/lib/jackett';
import { TorrentItem } from '@/types/torrent';

describe('Jackett Torrent Parser & Language Extractor', () => {
  it('parses video quality, codec and browser native capability', () => {
    const res = parseTorrentTitle('Supernatural.S01E01.1080p.WEB-DL.H.264.AAC-LostFilm');
    expect(res.quality).toBe('1080p');
    expect(res.codec).toBe('AVC / H.264');
    expect(res.isBrowserNative).toBe(true);
  });

  it('detects Russian and English audio tags without subtitle contamination', () => {
    const title = 'Supernatural (S15E01-20) [LostFilm & ENG] + [Subs Rus, Eng]';
    const lang = extractTorrentLanguages(title);
    expect(lang.languages).toContain('RUS');
    expect(lang.languages).toContain('ENG');
    expect(lang.hasSubtitles).toBe(true);
  });

  it('detects English only for original releases with Russian subtitles', () => {
    const title = 'Something in the Dirt (2022) WEB-DL 1080p Original + Sub Rus';
    const lang = extractTorrentLanguages(title);
    expect(lang.languages).toContain('ENG');
    expect(lang.hasSubtitles).toBe(true);
  });

  it('deduplicates torrents with matching links or magnets', () => {
    const baseItem: TorrentItem = {
      id: '1',
      title: 'Movie 2024 1080p',
      category: [],
      size: 1000,
      formattedSize: '1 GB',
      publishDate: '2024',
      seeders: 10,
      peers: 2,
      link: 'magnet:?xt=urn:btih:ABCDEF123456',
      magnetUrl: 'magnet:?xt=urn:btih:ABCDEF123456',
      indexer: 'Rutor',
      quality: '1080p',
      languages: ['RUS'],
      hasSubtitles: false,
      isBrowserNative: true,
    };

    const duplicateItem: TorrentItem = {
      ...baseItem,
      id: '2',
      indexer: 'NNMClub',
    };

    const merged = mergeUniqueTorrents([[baseItem], [duplicateItem]]);
    expect(merged.length).toBe(1);
    expect(merged[0].indexer).toBe('Rutor');
  });
});
