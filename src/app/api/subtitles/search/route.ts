import { NextRequest, NextResponse } from 'next/server';
import { tmdb } from '@/lib/tmdb';
import { getSubtitleFormat } from '@/lib/torrserver';
import { SubtitleTrackOption } from '@/types/torrent';

export const dynamic = 'force-dynamic';

interface OpenSubtitlesV3Entry {
  id?: string | number;
  url?: string;
  lang?: string;
  SubEncoding?: string;
  subtitleFileName?: string;
  movieReleaseName?: string;
  releaseGroup?: string;
}

const LANG_PRIORITY: Record<string, number> = {
  rus: 0,
  ru: 0,
  eng: 1,
  en: 1,
  ukr: 2,
  uk: 2,
};

const LANG_LABELS: Record<string, string> = {
  rus: 'RUS (Русский)',
  ru: 'RUS (Русский)',
  eng: 'ENG (English)',
  en: 'ENG (English)',
  ukr: 'UKR (Украинский)',
  uk: 'UKR (Украинский)',
};

function normalizeLangCode(lang?: string): string {
  const lower = (lang || '').toLowerCase().trim();
  if (lower === 'ru' || lower === 'rus') return 'RUS';
  if (lower === 'en' || lower === 'eng') return 'ENG';
  if (lower === 'uk' || lower === 'ukr') return 'UKR';
  return (lang || 'SUB').toUpperCase();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let mediaType = searchParams.get('mediaType') as 'movie' | 'tv' | null;
    let mediaId = searchParams.get('mediaId');
    const title = searchParams.get('title') || '';
    const season = parseInt(searchParams.get('season') || '0', 10);
    const episode = parseInt(searchParams.get('episode') || '0', 10);

    // Fallback: look up TMDB item by title if mediaId was omitted (e.g. raw magnet link)
    if ((!mediaId || !mediaType) && title) {
      const cleanedTitle = title
        .replace(/\(?\d{4}\)?/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/s\d+e\d+/gi, '')
        .trim();
      if (cleanedTitle.length >= 2) {
        const matches = await tmdb.searchMulti(cleanedTitle);
        const preferredType = season > 0 && episode > 0 ? 'tv' : undefined;
        const picked =
          (preferredType ? matches.find((m) => m.media_type === preferredType) : null) ||
          matches[0];
        if (picked) {
          mediaId = String(picked.id);
          mediaType = (picked.media_type === 'tv' ? 'tv' : 'movie');
        }
      }
    }

    if (!mediaId || (mediaType !== 'movie' && mediaType !== 'tv')) {
      return NextResponse.json({ success: true, subtitles: [] });
    }

    const externalIds = await tmdb.getExternalIds(mediaId, mediaType);
    const imdbId = externalIds?.imdb_id;
    if (!imdbId) {
      return NextResponse.json({ success: true, subtitles: [] });
    }

    const endpoint =
      mediaType === 'tv' && season > 0 && episode > 0
        ? `https://opensubtitles-v3.strem.io/subtitles/series/${encodeURIComponent(imdbId)}:${season}:${episode}.json`
        : `https://opensubtitles-v3.strem.io/subtitles/movie/${encodeURIComponent(imdbId)}.json`;

    const res = await fetch(endpoint, {
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'KinoStream/1.0',
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ success: true, subtitles: [] });
    }

    const data = await res.json();
    const rawList: OpenSubtitlesV3Entry[] = Array.isArray(data?.subtitles) ? data.subtitles : [];

    // Prioritize RUS, ENG, UKR and limit entries per language so dropdown stays concise
    const perLangCounts = new Map<string, number>();
    const sorted = [...rawList].sort((a, b) => {
      const pa = LANG_PRIORITY[(a.lang || '').toLowerCase()] ?? 99;
      const pb = LANG_PRIORITY[(b.lang || '').toLowerCase()] ?? 99;
      return pa - pb;
    });

    const tracks: SubtitleTrackOption[] = [];
    for (const entry of sorted) {
      if (!entry.url) continue;
      const rawLang = (entry.lang || 'und').toLowerCase();
      const priority = LANG_PRIORITY[rawLang] ?? 99;
      const maxForLang = priority === 0 || priority === 1 ? 5 : priority === 2 ? 2 : 1;
      const count = perLangCounts.get(rawLang) || 0;
      if (count >= maxForLang) continue;
      if (tracks.length >= 16) break;

      perLangCounts.set(rawLang, count + 1);

      const fileName = entry.subtitleFileName || entry.movieReleaseName || `subtitles-${entry.id || tracks.length + 1}.srt`;
      const langCode = normalizeLangCode(rawLang);
      const langDisplay = LANG_LABELS[rawLang] || langCode;
      const releaseHint = entry.releaseGroup || entry.movieReleaseName || fileName;
      const shortHint = releaseHint.length > 34 ? releaseHint.slice(0, 31) + '...' : releaseHint;

      tracks.push({
        id: `os-${entry.id || tracks.length}`,
        label: `${langDisplay} • ${shortHint}`,
        language: langCode,
        url: `/api/subtitles/fetch?url=${encodeURIComponent(entry.url)}&name=${encodeURIComponent(fileName)}`,
        format: getSubtitleFormat(fileName),
        source: 'opensubtitles',
        fileName,
      });
    }

    return NextResponse.json({ success: true, subtitles: tracks });
  } catch (error) {
    console.warn('Subtitle search failed:', error);
    return NextResponse.json({ success: true, subtitles: [] });
  }
}
