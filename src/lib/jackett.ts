import { XMLParser } from 'fast-xml-parser';
import { TorrentItem, VideoQuality } from '@/types/torrent';
import { formatBytes } from './utils';

const JACKETT_URL = process.env.JACKETT_URL || 'http://localhost:9117';
const JACKETT_API_KEY = process.env.JACKETT_API_KEY || '';

interface ParseResult {
  quality: VideoQuality;
  codec?: string;
  audio?: string;
  ripType?: string;
  isBrowserNative: boolean;
}

/**
 * Intelligent regex parser to extract quality, audio dubbing, rip type, codec and browser compatibility from torrent title
 */
export function parseTorrentTitle(title: string): ParseResult {
  const t = title.toLowerCase();

  // 1. Resolution / Quality
  let quality: VideoQuality = 'Unknown';
  if (/2160p|4k|uhd/i.test(title)) {
    quality = '4K';
  } else if (/1080p|1080i|fhd/i.test(title)) {
    quality = '1080p';
  } else if (/720p|hd\b/i.test(title)) {
    quality = '720p';
  } else if (/480p|576p|dvd\b|dvdrip/i.test(title)) {
    quality = '480p';
  }

  // 2. Video Codec
  let codec: string | undefined;
  if (/hevc|h\.?265|x265/i.test(title)) {
    codec = 'HEVC / H.265';
  } else if (/avc|h\.?264|x264/i.test(title)) {
    codec = 'AVC / H.264';
  } else if (/av1/i.test(title)) {
    codec = 'AV1';
  } else if (/xvid|divx/i.test(title)) {
    codec = 'XviD';
  }

  // 3. Audio / Translation info
  let audio: string | undefined;
  if (/дубляж|dub|дублированный/i.test(title)) {
    audio = 'Дубляж';
  } else if (/lostfilm|лостфильм/i.test(title)) {
    audio = 'LostFilm';
  } else if (/кубик в кубе|kubik v kube/i.test(title)) {
    audio = 'Кубик в Кубе';
  } else if (/hdrezka|rezka/i.test(title)) {
    audio = 'HDRezka';
  } else if (/newstudio/i.test(title)) {
    audio = 'NewStudio';
  } else if (/alexfilm/i.test(title)) {
    audio = 'AlexFilm';
  } else if (/пифагор/i.test(title)) {
    audio = 'Пифагор';
  } else if (/мво|mvo|многоголосый/i.test(title)) {
    audio = 'Многоголосый (MVO)';
  } else if (/дво|dvo|двухголосый/i.test(title)) {
    audio = 'Двухголосый (DVO)';
  } else if (/avo|авторский|одноголосый/i.test(title)) {
    audio = 'Авторский (AVO)';
  } else if (/original|eng/i.test(title)) {
    audio = 'Original Audio';
  }

  // 4. Rip type
  let ripType: string | undefined;
  if (/remux/i.test(title)) {
    ripType = 'REMUX';
  } else if (/bdrip|bluray|blu-ray/i.test(title)) {
    ripType = 'BDRip';
  } else if (/web-dl|webdl/i.test(title)) {
    ripType = 'WEB-DL';
  } else if (/webrip/i.test(title)) {
    ripType = 'WEBRip';
  } else if (/hdtv/i.test(title)) {
    ripType = 'HDTV';
  } else if (/camrip|ts|telesync/i.test(title)) {
    ripType = 'CAMRip';
  }

  // 5. Browser Compatibility Check
  // Incompatible video: HEVC, XviD, DivX, AV1, DVD/VOB
  const hasIncompatibleVideo = /hevc|h\.?265|x265|xvid|divx|av1|vc-?1|mpeg-?2|dvdrip|dvdr|vob/i.test(title);
  // Incompatible heavy audio: DTS, TrueHD, FLAC, Atmos
  const hasIncompatibleAudio = /dts(-hd)?|truehd|flac|lpcm|atmos/i.test(title);
  // Uncompressed or raw Blu-Ray remuxes are usually MKV with AC3/DTS
  const isRemuxOrDisc = /\bremux\b|bluray|blu-ray|bdmv/i.test(title);

  // Compatible video: explicitly AVC / H.264 / x264, MP4, or WEB-DL / WEBRip / HDTV
  const hasCompatibleVideo =
    /avc|h\.?264|x264|mp4\b/i.test(title) || /web-?dl|web-?rip|hdtv/i.test(title);

  const isBrowserNative =
    hasCompatibleVideo && !hasIncompatibleVideo && !hasIncompatibleAudio && !isRemuxOrDisc;

  return { quality, codec, audio, ripType, isBrowserNative };
}

export const jackett = {
  /**
   * Search torrents on Jackett / Prowlarr via Torznab API
   */
  async search(query: string, year?: string | number): Promise<TorrentItem[]> {
    if (!JACKETT_API_KEY) {
      console.warn('JACKETT_API_KEY is not configured in environment variables.');
    }

    const searchQuery = year ? `${query} ${year}` : query;
    const url = new URL(`${JACKETT_URL}/api/v2.0/indexers/all/results/torznab/api`);
    url.searchParams.append('apikey', JACKETT_API_KEY);
    url.searchParams.append('t', 'search');
    url.searchParams.append('q', searchQuery);
    url.searchParams.append('format', 'json');

    try {
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/json, text/xml, */*' },
        next: { revalidate: 300 }, // Cache search for 5 minutes
      });

      if (!res.ok) {
        throw new Error(`Jackett response error: ${res.status} ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type') || '';
      let rawResults: any[] = [];

      if (contentType.includes('application/json')) {
        const jsonData = await res.json();
        rawResults = jsonData.Results || jsonData.items || [];
      } else {
        // Parse Torznab XML fallback
        const xmlText = await res.text();
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        const xmlObj = parser.parse(xmlText);
        const channel = xmlObj?.rss?.channel;
        const items = channel?.item;
        rawResults = Array.isArray(items) ? items : items ? [items] : [];
      }

      const parsedItems: TorrentItem[] = rawResults.map((item: any, idx: number) => {
        const title = item.Title || item.title || 'Unknown Title';
        const size = Number(item.Size || item.size || item['@_length'] || 0);
        const seeders = Number(item.Seeders || item.seeders || item['torznab:attr']?.find?.((a: any) => a['@_name'] === 'seeders')?.['@_value'] || 0);
        const peers = Number(item.Peers || item.peers || item['torznab:attr']?.find?.((a: any) => a['@_name'] === 'peers')?.['@_value'] || 0);
        const link = item.Link || item.link || '';
        const magnetUrl = item.MagnetUri || item.magneturl || (link.startsWith('magnet:') ? link : undefined);
        const publishDate = item.PublishDate || item.pubDate || new Date().toISOString();
        const indexer = item.Tracker || item.indexer || 'Indexer';

        const { quality, codec, audio, ripType, isBrowserNative } = parseTorrentTitle(title);

        return {
          id: `${indexer}-${idx}-${Date.now()}`,
          title,
          category: [],
          size,
          formattedSize: formatBytes(size),
          publishDate,
          seeders,
          peers,
          link: magnetUrl || link,
          magnetUrl,
          indexer,
          quality,
          codec,
          audio,
          ripType,
          isBrowserNative,
        };
      });

      // Filter and sort by seeders descending (give priority to healthy torrents)
      return parsedItems.sort((a, b) => b.seeders - a.seeders);
    } catch (e) {
      console.error('Failed to query Jackett:', e);
      return [];
    }
  },
};
