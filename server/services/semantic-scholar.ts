import { readThroughCache } from './cache';
import { fetchJsonWithPolicy } from './http';

export type SemanticScholarAuthor = {
  name?: string;
  homepage?: string;
  affiliations?: string[];
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
};

type SemanticScholarSearchResponse = {
  total?: number;
  data?: SemanticScholarAuthor[];
};

const SEMANTIC_SCHOLAR_API_BASE = 'https://api.semanticscholar.org/graph/v1';
const SEMANTIC_SCHOLAR_API_KEY = process.env.SEMANTIC_SCHOLAR_API_KEY;
const SEMANTIC_SCHOLAR_TTL_MS = 48 * 60 * 60 * 1000;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export async function fetchSemanticScholarAuthor(name: string, institution?: string) {
  if (!SEMANTIC_SCHOLAR_API_KEY) {
    return null;
  }

  const query = normalizeWhitespace(`${name} ${institution ?? ''}`);

  try {
    return await readThroughCache({
      namespace: 'semantic-scholar-author',
      key: query.toLowerCase(),
      ttlMs: SEMANTIC_SCHOLAR_TTL_MS,
      loader: async () => {
        const response = await fetchJsonWithPolicy<SemanticScholarSearchResponse>(
          `${SEMANTIC_SCHOLAR_API_BASE}/author/search?query=${encodeURIComponent(query)}&limit=1&fields=name,homepage,affiliations,paperCount,citationCount,hIndex`,
          undefined,
          {
            headers: {
              'x-api-key': SEMANTIC_SCHOLAR_API_KEY,
            },
          },
        );

        return response.data?.[0] ?? null;
      },
      shouldCache: (value) => Boolean(value),
    });
  } catch {
    return null;
  }
}
