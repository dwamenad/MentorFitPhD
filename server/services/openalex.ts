import { isSupportedCountryCode, normalizePreferredCountries } from '../../src/lib/countries';
import type { StudentProfile } from '../../src/types';
import { readThroughCache } from './cache';
import { fetchJsonWithPolicy } from './http';

export type OpenAlexInstitution = {
  id?: string;
  display_name?: string;
  country_code?: string;
  type?: string;
};

type OpenAlexAuthorReference = {
  id?: string;
  display_name?: string;
  orcid?: string;
};

export type OpenAlexTopic = {
  display_name?: string;
  subfield?: {
    display_name?: string;
  };
  field?: {
    display_name?: string;
  };
};

export type OpenAlexKeyword = {
  display_name?: string;
};

type OpenAlexAuthorship = {
  author_position?: string;
  author?: OpenAlexAuthorReference;
  institutions?: OpenAlexInstitution[];
};

export type OpenAlexWork = {
  id: string;
  display_name?: string;
  relevance_score?: number;
  publication_year?: number;
  cited_by_count?: number;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: OpenAlexAuthorship[];
  primary_location?: {
    source?: {
      display_name?: string;
    };
  };
  keywords?: OpenAlexKeyword[];
  topics?: OpenAlexTopic[];
};

export type OpenAlexAuthor = {
  id: string;
  display_name?: string;
  orcid?: string;
  works_count?: number;
  cited_by_count?: number;
  summary_stats?: {
    h_index?: number;
  };
  last_known_institutions?: OpenAlexInstitution[];
  topics?: OpenAlexTopic[];
};

type OpenAlexListResponse<T> = {
  results: T[];
};

export type CandidateAuthor = {
  authorId: string;
  displayName: string;
  orcid?: string;
  institutionHints: string[];
  countryHints: string[];
  score: number;
};

const OPENALEX_API_BASE = 'https://api.openalex.org';
const OPENALEX_WORK_FILTER = 'is_paratext:false,has_abstract:true,type:article|book-chapter|preprint';
const OPENALEX_EMAIL = process.env.OPENALEX_EMAIL;

const MAX_DISCOVERY_QUERIES = 3;
const OPENALEX_WORKS_PER_QUERY = 12;
const MAX_DISCOVERY_CANDIDATES = 50;
const MAX_PUBLICATIONS_PER_PROFESSOR = 6;

const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;
const AUTHOR_TTL_MS = 72 * 60 * 60 * 1000;
const WORKS_TTL_MS = 48 * 60 * 60 * 1000;

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function compact<T>(values: Array<T | null | undefined | false>) {
  return values.filter(Boolean) as T[];
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function tokenize(text: string) {
  return unique(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  );
}

function extractOpenAlexId(value: string) {
  return value.replace(/^https?:\/\/openalex\.org\//, '');
}

function normalizeOrcid(value?: string) {
  return value?.replace(/^https?:\/\/orcid\.org\//, '').trim();
}

function isLikelyPersonName(value: string) {
  return /\s/.test(value) && !/consortium|committee|group|network|team/i.test(value);
}

function buildOpenAlexUrl(pathname: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(`${OPENALEX_API_BASE}${pathname}`);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.length > 0) {
      url.searchParams.set(key, `${value}`);
    }
  });

  if (OPENALEX_EMAIL) {
    url.searchParams.set('mailto', OPENALEX_EMAIL);
  }

  return url.toString();
}

function buildDiscoveryQueries(profile: StudentProfile) {
  const interestTokens = tokenize(profile.researchInterests).slice(0, 7).join(' ');
  const methodTokens = profile.methods.slice(0, 3).join(' ');

  return unique(
    compact([
      normalizeWhitespace(`${profile.field} ${profile.researchInterests}`),
      normalizeWhitespace(`${interestTokens} ${methodTokens}`),
      normalizeWhitespace(`${profile.field} ${methodTokens}`),
    ])
  ).slice(0, MAX_DISCOVERY_QUERIES);
}

async function searchWorks(query: string) {
  return readThroughCache({
    namespace: 'openalex-work-search',
    key: query.toLowerCase(),
    ttlMs: SEARCH_TTL_MS,
    loader: async () => {
      const response = await fetchJsonWithPolicy<OpenAlexListResponse<OpenAlexWork>>(
        buildOpenAlexUrl('/works', {
          search: query,
          filter: OPENALEX_WORK_FILTER,
          'per-page': OPENALEX_WORKS_PER_QUERY,
        }),
      );

      return response.results;
    },
  });
}

export async function searchCandidateAuthors(profile: StudentProfile) {
  const candidates = new Map<string, CandidateAuthor>();
  const queries = buildDiscoveryQueries(profile);
  const preferredCountries = new Set(normalizePreferredCountries((profile as Partial<StudentProfile>).preferredCountries));

  for (const [queryIndex, query] of queries.entries()) {
    const works = await searchWorks(query);

    works.forEach((work, workIndex) => {
      const workScore = (work.relevance_score ?? 0) / 500 + Math.log1p(work.cited_by_count ?? 0);
      const queryBoost = MAX_DISCOVERY_QUERIES - queryIndex;

      (work.authorships ?? []).slice(0, 6).forEach((authorship) => {
        if (!authorship.author?.id || !authorship.author.display_name || !isLikelyPersonName(authorship.author.display_name)) {
          return;
        }

        const authorId = extractOpenAlexId(authorship.author.id);
        const countryHints = unique(
          (authorship.institutions ?? [])
            .map((institution) => institution.country_code?.trim().toUpperCase())
            .filter(Boolean) as string[],
        );
        const normalizedCountryHints = countryHints.filter(isSupportedCountryCode);

        if (
          preferredCountries.size > 0
          && normalizedCountryHints.length > 0
          && !normalizedCountryHints.some((countryCode) => preferredCountries.has(countryCode))
        ) {
          return;
        }

        const positionBoost =
          authorship.author_position === 'first'
            ? 1.25
            : authorship.author_position === 'last'
              ? 1.15
              : 1;
        const countryBoost =
          preferredCountries.size > 0 && normalizedCountryHints.some((countryCode) => preferredCountries.has(countryCode))
            ? 1.2
            : 1;

        const existing = candidates.get(authorId);
        const nextScore = (existing?.score ?? 0) + (workScore + queryBoost + Math.max(0, 4 - workIndex) * 0.4) * positionBoost * countryBoost;
        const institutionHints = unique([
          ...(existing?.institutionHints ?? []),
          ...(authorship.institutions ?? []).map((institution) => institution.display_name).filter(Boolean) as string[],
        ]);
        const nextCountryHints = unique([
          ...(existing?.countryHints ?? []),
          ...normalizedCountryHints,
        ]);

        candidates.set(authorId, {
          authorId,
          displayName: authorship.author.display_name,
          orcid: normalizeOrcid(authorship.author.orcid),
          institutionHints,
          countryHints: nextCountryHints,
          score: nextScore,
        });
      });
    });
  }

  return [...candidates.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_DISCOVERY_CANDIDATES);
}

export async function fetchOpenAlexAuthor(authorId: string) {
  return readThroughCache({
    namespace: 'openalex-author',
    key: authorId,
    ttlMs: AUTHOR_TTL_MS,
    loader: () => fetchJsonWithPolicy<OpenAlexAuthor>(buildOpenAlexUrl(`/authors/${authorId}`)),
  });
}

export async function fetchOpenAlexAuthorWorks(authorId: string) {
  return readThroughCache({
    namespace: 'openalex-author-works',
    key: authorId,
    ttlMs: WORKS_TTL_MS,
    loader: async () => {
      const response = await fetchJsonWithPolicy<OpenAlexListResponse<OpenAlexWork>>(
        buildOpenAlexUrl('/works', {
          filter: `author.id:https://openalex.org/${authorId},${OPENALEX_WORK_FILTER}`,
          sort: 'publication_year:desc',
          'per-page': MAX_PUBLICATIONS_PER_PROFESSOR,
        }),
      );

      return response.results;
    },
  });
}
