import { readThroughCache } from './cache';
import { fetchJsonWithPolicy } from './http';

type OrcidResearcherUrl = {
  url?: {
    value?: string;
  };
};

export type OrcidEmploymentSummary = {
  'department-name'?: string;
  'role-title'?: string;
  organization?: {
    name?: string;
  };
};

export type OrcidRecord = {
  person?: {
    biography?: {
      content?: string;
    } | null;
    'researcher-urls'?: {
      'researcher-url'?: OrcidResearcherUrl[];
    };
  };
  'activities-summary'?: {
    employments?: {
      'affiliation-group'?: Array<{
        summaries?: Array<{
          'employment-summary'?: OrcidEmploymentSummary;
        }>;
      }>;
    };
  };
};

const ORCID_TTL_MS = 72 * 60 * 60 * 1000;

function compact<T>(values: Array<T | null | undefined | false>) {
  return values.filter(Boolean) as T[];
}

export function normalizeOrcid(value?: string) {
  return value?.replace(/^https?:\/\/orcid\.org\//, '').trim();
}

export async function fetchOrcidRecord(orcidId: string) {
  try {
    return await readThroughCache({
      namespace: 'orcid-record',
      key: orcidId,
      ttlMs: ORCID_TTL_MS,
      loader: () =>
        fetchJsonWithPolicy<OrcidRecord>(`https://pub.orcid.org/v3.0/${orcidId}/record`, undefined, {
          headers: {
            accept: 'application/json',
          },
        }),
      shouldCache: (value) => Boolean(value),
    });
  } catch {
    return null;
  }
}

export function getCurrentEmployment(orcidRecord: OrcidRecord | null) {
  return orcidRecord?.['activities-summary']?.employments?.['affiliation-group']
    ?.flatMap((group) => group.summaries ?? [])
    .map((summary) => summary['employment-summary'])
    .find(Boolean);
}

export function getResearcherUrls(orcidRecord: OrcidRecord | null) {
  return compact(
    orcidRecord?.person?.['researcher-urls']?.['researcher-url']?.map((entry) => entry.url?.value?.trim())
  );
}
