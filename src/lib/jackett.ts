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
  languages: string[];
  hasSubtitles: boolean;
  isBrowserNative: boolean;
}

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map<string, { items: TorrentItem[]; expiresAt: number }>();
const inflightSearches = new Map<string, Promise<TorrentItem[]>>();

export function extractTorrentLanguages(title: string, fallbackLangAttr?: string): {
  languages: string[];
  hasSubtitles: boolean;
} {
  const langs = new Set<string>();
  const hasSubtitles = /\bsubs?\b|субтитр/i.test(title);
  const combined = `${title} ${fallbackLangAttr || ''}`;

  // Strip subtitle-only language markers (e.g. "RUS Sub", "ENG Sub") so we don't confuse subtitle lang with audio lang
  const audioOnlyText = combined
    .replace(/\b(rus|ru|рус\.?)\s*(sub|subs|суб|субтитр\w*)/gi, '')
    .replace(/\b(eng|en|анг\.?)\s*(sub|subs|суб|субтитр\w*)/gi, '')
    .replace(/субтитр\w*\s*[:(\[]?\s*(rus|ru|рус\w*|eng|en)/gi, '');

  const hasRussianStudioOrDub =
    /дубляж|\bdub\b|дублирован|lostfilm|лостфильм|кубик|kubik|hdrezka|rezka|newstudio|alexfilm|novafilm|пифагор|кравец|kravec|рен-тв|ren-tv|мосфильм|невафильм|rhs|red head sound|jaskier|сыендук|anilibria|coldfilm|baibako|omskbird|гоблин|goblin|многоголос|двухголос|одноголос|закадр|\bmvo\b|\bdvo\b|\bavo\b|\bпмо\b|\bлм\b|\bлд\b|\|\s*[dpm](?:\s|,|$)|\brus\b|\bru\b|русск|(?<![a-z])рус(?![a-z])/i.test(
      audioOnlyText
    );

  const isOriginalWithoutDub =
    /без перевода|оригинал\s*\+\s*суб|original\s*\+?\s*sub/i.test(combined) &&
    !hasRussianStudioOrDub;

  const hasCyrillic = /[а-яА-ЯёЁ]/.test(title);

  if (hasRussianStudioOrDub || (hasCyrillic && !isOriginalWithoutDub)) {
    langs.add('RUS');
  }

  const hasEnglishTag =
    /\beng\b|\benglish\b|английск|\borig\b|\boriginal\b|оригинал|\bmulti\b|\bdual\b/i.test(
      audioOnlyText
    );

  if (hasEnglishTag || (!hasCyrillic && !hasRussianStudioOrDub)) {
    langs.add('ENG');
  }

  if (/\bukr\b|укр|ukrainian/i.test(audioOnlyText)) langs.add('UKR');
  if (/\bjpn\b|\bjap\b|японск/i.test(audioOnlyText)) langs.add('JPN');
  if (/\bkor\b|корейск/i.test(audioOnlyText)) langs.add('KOR');
  if (/\bfra\b|\bfre\b|француз/i.test(audioOnlyText)) langs.add('FRA');
  if (/\bger\b|\bdeu\b|немецк/i.test(audioOnlyText)) langs.add('DEU');
  if (/\bspa\b|испанск/i.test(audioOnlyText)) langs.add('SPA');
  if (/\bita\b|итальянск/i.test(audioOnlyText)) langs.add('ITA');

  return {
    languages: Array.from(langs),
    hasSubtitles,
  };
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

  // 5. Audio Languages & Subtitles
  const { languages, hasSubtitles } = extractTorrentLanguages(title);

  // 6. Browser Compatibility Check
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

  return { quality, codec, audio, ripType, languages, hasSubtitles, isBrowserNative };
}

interface ConfiguredIndexer {
  id: string;
  title: string;
}

const INDEXERS_CACHE_TTL_MS = 5 * 60 * 1000;
const DEAD_INDEXER_COOLDOWN_MS = 3 * 60 * 1000;
let cachedIndexers: { list: ConfiguredIndexer[]; expiresAt: number } | null = null;
const indexerCooldownUntil = new Map<string, number>();

async function getConfiguredIndexers(
  jackettUrl: string,
  jackettApiKey: string
): Promise<ConfiguredIndexer[] | null> {
  const now = Date.now();
  if (cachedIndexers && cachedIndexers.expiresAt > now) {
    return cachedIndexers.list;
  }

  try {
    const url = new URL(`${jackettUrl}/api/v2.0/indexers/all/results/torznab/api`);
    url.searchParams.append('apikey', jackettApiKey);
    url.searchParams.append('t', 'indexers');
    url.searchParams.append('configured', 'true');

    const res = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      throw new Error(`Ошибка ответа Jackett: HTTP ${res.status} ${res.statusText}`);
    }

    const xmlText = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const xmlObj = parser.parse(xmlText);

    if (xmlObj?.error) {
      const desc = xmlObj.error['@_description'] || xmlObj.error['@_code'] || 'Invalid API Key';
      throw new Error(`Jackett ошибка (${desc}). Проверьте JACKETT_API_KEY.`);
    }

    const rawIndexers = xmlObj?.indexers?.indexer;
    if (!rawIndexers) {
      // Succeeded, but 0 indexers configured
      return [];
    }

    const listRaw = Array.isArray(rawIndexers) ? rawIndexers : [rawIndexers];
    const list: ConfiguredIndexer[] = listRaw
      .map((ix: any) => ({
        id: String(ix?.['@_id'] || ''),
        title: String(
          typeof ix?.title === 'object' ? ix.title['#text'] || ix?.['@_id'] : ix?.title || ix?.['@_id'] || 'Indexer'
        ),
      }))
      .filter((ix) => ix.id.length > 0);

    cachedIndexers = {
      list,
      expiresAt: Date.now() + INDEXERS_CACHE_TTL_MS,
    };
    return list;
  } catch (err: any) {
    // Re-throw explicit API key / auth errors
    if (err?.message?.includes('JACKETT_API_KEY') || err?.message?.includes('Jackett ошибка')) {
      throw err;
    }
    console.warn('[Jackett] Failed to list configured indexers, falling back to /all:', err?.message);
    return null;
  }
}

async function fetchIndexerTorznab(
  jackettUrl: string,
  jackettApiKey: string,
  indexerId: string,
  defaultIndexerTitle: string,
  searchQuery: string,
  timeoutMs: number
): Promise<TorrentItem[]> {
  const url = new URL(`${jackettUrl}/api/v2.0/indexers/${encodeURIComponent(indexerId)}/results/torznab/api`);
  url.searchParams.append('apikey', jackettApiKey);
  url.searchParams.append('t', 'search');
  url.searchParams.append('q', searchQuery);
  url.searchParams.append('format', 'json');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json, text/xml, */*' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Ошибка ответа Jackett (${defaultIndexerTitle}): HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  let rawResults: any[] = [];

  if (contentType.includes('application/json')) {
    const jsonData = await res.json();
    if (jsonData?.error) {
      throw new Error(`Jackett API error (${defaultIndexerTitle}): ${jsonData.error}`);
    }
    rawResults = jsonData.Results || jsonData.items || [];
  } else {
    const xmlText = await res.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const xmlObj = parser.parse(xmlText);

    if (xmlObj?.error) {
      const desc = xmlObj.error['@_description'] || xmlObj.error['@_code'] || 'Unknown Torznab error';
      throw new Error(`Jackett ошибка (${desc}). Проверьте JACKETT_API_KEY и трекеры.`);
    }

    const channel = xmlObj?.rss?.channel;
    const items = channel?.item;
    rawResults = Array.isArray(items) ? items : items ? [items] : [];
  }

  const parsedItems: TorrentItem[] = [];

  for (let idx = 0; idx < rawResults.length; idx++) {
    const item = rawResults[idx];
    if (!item || typeof item !== 'object') continue;

    try {
      const rawTitle = item.Title ?? item.title ?? 'Unknown Title';
      const title =
        typeof rawTitle === 'object' && rawTitle !== null
          ? String(rawTitle['#text'] ?? 'Unknown Title')
          : String(rawTitle);

      const size = Number(item.Size ?? item.size ?? item['@_length'] ?? 0) || 0;

      const rawAttrs = item['torznab:attr'];
      const attrs = Array.isArray(rawAttrs) ? rawAttrs : rawAttrs ? [rawAttrs] : [];
      const getAttr = (name: string) =>
        attrs.find((a: any) => a?.['@_name'] === name)?.['@_value'];

      const seeders = Number(item.Seeders ?? item.seeders ?? getAttr('seeders') ?? 0) || 0;
      const peers = Number(item.Peers ?? item.peers ?? getAttr('peers') ?? 0) || 0;

      const rawLink = item.Link ?? item.link ?? '';
      const link =
        typeof rawLink === 'object' && rawLink !== null
          ? String(rawLink['#text'] ?? '')
          : String(rawLink);

      const rawMagnet = item.MagnetUri ?? item.magneturl ?? getAttr('magneturl');
      const magnetUrl =
        typeof rawMagnet === 'string' && rawMagnet
          ? rawMagnet
          : link.startsWith('magnet:')
          ? link
          : undefined;

      const publishDate = String(item.PublishDate ?? item.pubDate ?? new Date().toISOString());

      const jackettIdx = item.jackettindexer;
      const indexerName = String(
        item.Tracker ||
          item.tracker ||
          item.indexer ||
          (typeof jackettIdx === 'string' ? jackettIdx : jackettIdx?.['#text']) ||
          defaultIndexerTitle
      );

      const parsed = parseTorrentTitle(title);
      const langAttr = getAttr('language');
      const finalLangs = langAttr
        ? extractTorrentLanguages(title, String(langAttr))
        : {
            languages: parsed.languages,
            hasSubtitles: parsed.hasSubtitles,
          };

      parsedItems.push({
        id: `${indexerName}-${idx}-${Date.now()}`,
        title,
        category: [],
        size,
        formattedSize: formatBytes(size),
        publishDate,
        seeders,
        peers,
        link: magnetUrl || link,
        magnetUrl,
        indexer: indexerName,
        quality: parsed.quality,
        codec: parsed.codec,
        audio: parsed.audio,
        ripType: parsed.ripType,
        languages: finalLangs.languages,
        hasSubtitles: finalLangs.hasSubtitles,
        isBrowserNative: parsed.isBrowserNative,
      });
    } catch (itemErr) {
      console.warn('Skipping malformed torrent item:', itemErr);
    }
  }

  return parsedItems;
}

async function fetchJackettRaw(searchQuery: string): Promise<TorrentItem[]> {
  const jackettUrl = (process.env.JACKETT_URL || JACKETT_URL).replace(/\/+$/, '');
  const jackettApiKey = process.env.JACKETT_API_KEY || JACKETT_API_KEY;

  if (!jackettApiKey) {
    throw new Error('Не указан JACKETT_API_KEY в файле .env на сервере');
  }

  const indexers = await getConfiguredIndexers(jackettUrl, jackettApiKey);

  // If 0 indexers are configured in Jackett, warn the user immediately
  if (indexers !== null && indexers.length === 0) {
    throw new Error('В Jackett не добавлено ни одного трекера. Добавьте трекеры (например Rutor) в панели Jackett.');
  }

  // Fallback to aggregate 'all' if indexer listing failed
  if (indexers === null) {
    const items = await fetchIndexerTorznab(jackettUrl, jackettApiKey, 'all', 'Indexer', searchQuery, 35000);
    return items.sort((a, b) => b.seeders - a.seeders);
  }

  // Query each configured indexer in parallel with independent 8s timeouts
  // so 1 dead/blocked tracker cannot stall fast trackers like Rutor!
  const now = Date.now();
  const activeIndexers = indexers.filter((ix) => {
    const until = indexerCooldownUntil.get(ix.id) || 0;
    return until <= now;
  });
  const targetIndexers = activeIndexers.length > 0 ? activeIndexers : indexers;

  const perIndexerTimeout = targetIndexers.length === 1 ? 18000 : 8000;

  const settled = await Promise.allSettled(
    targetIndexers.map((ix) =>
      fetchIndexerTorznab(jackettUrl, jackettApiKey, ix.id, ix.title, searchQuery, perIndexerTimeout)
    )
  );

  const combined: TorrentItem[] = [];
  const seen = new Set<string>();
  let successCount = 0;
  let firstError: Error | null = null;

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const ix = targetIndexers[i];
    if (result.status === 'fulfilled') {
      successCount++;
      indexerCooldownUntil.delete(ix.id);
      for (const item of result.value) {
        const key = (item.magnetUrl || item.link || item.title).toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }
    } else {
      console.warn(`[Jackett] Indexer "${ix.title}" (${ix.id}) failed/timed out:`, result.reason?.message || result.reason);
      if (!firstError) {
        firstError = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
      }
      // Temporarily skip failing/hanging indexer only when multiple indexers exist
      if (targetIndexers.length > 1) {
        indexerCooldownUntil.set(ix.id, Date.now() + DEAD_INDEXER_COOLDOWN_MS);
      }
    }
  }

  if (successCount === 0 && firstError) {
    throw firstError;
  }

  console.log(`[Jackett] Query "${searchQuery}" -> ${combined.length} results from ${successCount}/${targetIndexers.length} indexers`);

  // Sort by seeders descending (give priority to healthy torrents)
  return combined.sort((a, b) => b.seeders - a.seeders);
}

export const jackett = {
  /**
   * Search torrents on Jackett / Prowlarr via Torznab API with caching & in-flight deduplication
   */
  async search(query: string, year?: string | number): Promise<TorrentItem[]> {
    const searchQuery = year ? `${query} ${year}` : query;
    const cacheKey = searchQuery.trim().toLowerCase();
    const now = Date.now();

    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.items;
    }

    const inflight = inflightSearches.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const promise = fetchJackettRaw(searchQuery)
      .then((items) => {
        inflightSearches.delete(cacheKey);
        if (items.length > 0) {
          if (searchCache.size > 150) {
            const oldestKey = searchCache.keys().next().value;
            if (oldestKey) searchCache.delete(oldestKey);
          }
          searchCache.set(cacheKey, {
            items,
            expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
          });
        }
        return items;
      })
      .catch((err) => {
        inflightSearches.delete(cacheKey);
        throw err;
      });

    inflightSearches.set(cacheKey, promise);
    return promise;
  },
};
