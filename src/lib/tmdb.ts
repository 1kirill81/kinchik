import { MediaDetails, MediaItem, TMDBResponse, TVSeasonDetails } from '@/types/tmdb';

const TMDB_BASE_URL = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_IMAGE_BASE_URL = process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p';

export const tmdb = {
  /**
   * Helper to build full image URL from TMDB path
   */
  getImageUrl(path: string | null, size: 'w300' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500'): string {
    if (!path) return '/placeholder-poster.svg';
    return `/api/tmdb/image?path=${encodeURIComponent(path)}&size=${size}`;
  },

  /**
   * Universal fetcher with TMDB auth and locale
   */
  async fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    if (!TMDB_API_KEY) {
      console.warn('TMDB_API_KEY is not configured in environment variables.');
    }

    const queryParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: 'ru-RU', // Default to Russian localization for descriptions, fallback available
      ...params,
    });

    const url = `${TMDB_BASE_URL}${endpoint}?${queryParams.toString()}`;

    const res = await fetch(url, {
      next: { revalidate: 3600 }, // Cache for 1 hour
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`TMDB error ${res.status}: ${res.statusText} at ${endpoint}`);
    }

    return res.json();
  },

  /**
   * Get trending media for today/this week
   */
  async getTrending(mediaType: 'all' | 'movie' | 'tv' = 'all', timeWindow: 'day' | 'week' = 'day'): Promise<MediaItem[]> {
    try {
      const data = await this.fetchTMDB<TMDBResponse<MediaItem>>(`/trending/${mediaType}/${timeWindow}`);
      return data.results.map((item) => ({
        ...item,
        media_type: item.media_type || (item.title ? 'movie' : 'tv'),
      }));
    } catch (e) {
      console.error('Failed to get trending:', e);
      return [];
    }
  },

  /**
   * Get popular movies
   */
  async getPopularMovies(page = 1): Promise<MediaItem[]> {
    try {
      const data = await this.fetchTMDB<TMDBResponse<MediaItem>>('/movie/popular', { page: String(page) });
      return data.results.map((item) => ({ ...item, media_type: 'movie' }));
    } catch (e) {
      console.error('Failed to get popular movies:', e);
      return [];
    }
  },

  /**
   * Get popular TV shows
   */
  async getPopularTV(page = 1): Promise<MediaItem[]> {
    try {
      const data = await this.fetchTMDB<TMDBResponse<MediaItem>>('/tv/popular', { page: String(page) });
      return data.results.map((item) => ({ ...item, media_type: 'tv' }));
    } catch (e) {
      console.error('Failed to get popular TV:', e);
      return [];
    }
  },

  /**
   * Search movies & TV series by title
   */
  async searchMulti(query: string, page = 1): Promise<MediaItem[]> {
    if (!query.trim()) return [];

    try {
      const data = await this.fetchTMDB<TMDBResponse<MediaItem>>('/search/multi', {
        query: query.trim(),
        page: String(page),
        include_adult: 'false',
      });

      return data.results
        .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
        .map((item) => ({
          ...item,
          media_type: item.media_type || (item.title ? 'movie' : 'tv'),
        }));
    } catch (e) {
      console.error('Failed to search multi:', e);
      return [];
    }
  },

  /**
   * Get detailed info for movie or TV show
   */
  async getDetails(id: string | number, mediaType: 'movie' | 'tv'): Promise<MediaDetails | null> {
    try {
      const data = await this.fetchTMDB<MediaDetails>(`/${mediaType}/${id}`, {
        append_to_response: 'credits,videos,recommendations,similar',
      });

      return {
        ...data,
        media_type: mediaType,
      };
    } catch (e) {
      console.error(`Failed to get details for ${mediaType} ${id}:`, e);
      return null;
    }
  },

  /**
   * Get TV season details with episode list
   */
  async getSeasonDetails(tvId: string | number, seasonNumber: number): Promise<TVSeasonDetails | null> {
    try {
      return await this.fetchTMDB<TVSeasonDetails>(`/tv/${tvId}/season/${seasonNumber}`);
    } catch (e) {
      console.error(`Failed to get season ${seasonNumber} for tv ${tvId}:`, e);
      return null;
    }
  },

  /**
   * Get external IDs (e.g. IMDb ID) for movie or TV show
   */
  async getExternalIds(
    id: string | number,
    mediaType: 'movie' | 'tv'
  ): Promise<{ imdb_id?: string | null } | null> {
    try {
      return await this.fetchTMDB<{ imdb_id?: string | null }>(`/${mediaType}/${id}/external_ids`);
    } catch (e) {
      console.error(`Failed to get external IDs for ${mediaType} ${id}:`, e);
      return null;
    }
  },
};
