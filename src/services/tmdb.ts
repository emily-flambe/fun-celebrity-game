import type { Env } from '../types/env';

export interface Celebrity {
  id: number;
  name: string;
  image_url: string;
  relevance_window: { start: number; end: number };
  occupation: string;
  popularity_score: number;
  top_works: string[];
}

interface TMDBKnownFor {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  media_type: string;
}

interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  popularity: number;
  known_for_department: string;
  known_for: TMDBKnownFor[];
}

// Compute current year dynamically (module-level Date can be stale in Workers)
function getCurrentYear(): number {
  return new Date().getFullYear();
}

function getYear(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const year = parseInt(dateStr.split('-')[0], 10);
  return isNaN(year) ? null : year;
}

// Estimate relevance window from known_for data (no extra API calls needed)
function estimateRelevanceWindow(knownFor: TMDBKnownFor[]): { start: number; end: number } | null {
  const currentYear = getCurrentYear();
  const years: number[] = [];

  for (const work of knownFor) {
    const year = getYear(work.release_date) || getYear(work.first_air_date);
    if (year && year >= 1920 && year <= currentYear) {
      years.push(year);
    }
  }

  if (years.length === 0) return null;

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  // Expand window slightly for more realistic ranges
  const start = Math.max(1950, minYear - 3);
  const end = Math.min(currentYear, maxYear + 3);

  // Minimum window of 5 years
  if (end - start < 5) {
    const mid = Math.floor((start + end) / 2);
    return { start: mid - 3, end: mid + 3 };
  }

  return { start, end };
}

export async function fetchPopularPeople(env: Env, pages: number = 3): Promise<TMDBPerson[]> {
  const people: TMDBPerson[] = [];

  // Fetch pages in parallel for speed
  const pagePromises = [];
  for (let page = 1; page <= pages; page++) {
    pagePromises.push(
      fetch(`https://api.themoviedb.org/3/person/popular?page=${page}`, {
        headers: {
          'Authorization': `Bearer ${env.TMDB_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }).then(res => res.json() as Promise<{ results: TMDBPerson[] }>)
    );
  }

  const results = await Promise.all(pagePromises);
  for (const data of results) {
    people.push(...data.results);
  }

  return people.filter(p => p.profile_path);
}

// Build celebrity data directly from the person object (no additional API calls)
export function buildCelebrityFromPerson(person: TMDBPerson): Celebrity | null {
  // Handle case where known_for might be undefined or empty
  if (!person.known_for || person.known_for.length === 0) {
    return null;
  }

  const window = estimateRelevanceWindow(person.known_for);
  if (!window) return null;

  const topWorks = person.known_for
    .map(w => w.title || w.name)
    .filter((name): name is string => !!name)
    .slice(0, 3);

  if (topWorks.length === 0) return null;

  // Normalize popularity to 0-100
  const popularityScore = Math.min(100, Math.round(person.popularity));

  return {
    id: person.id,
    name: person.name,
    image_url: `https://image.tmdb.org/t/p/w500${person.profile_path}`,
    relevance_window: window,
    occupation: person.known_for_department || 'Actor',
    popularity_score: popularityScore,
    top_works: topWorks,
  };
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectCelebritiesForSession(celebrities: Celebrity[], count: number = 40): Celebrity[] {
  // Simple selection: shuffle and take first N celebrities
  // Most popular celebrities from TMDB are recent, so just use what we have
  const shuffled = shuffle(celebrities);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
