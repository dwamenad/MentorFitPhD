import { getCountryLabel, normalizePreferredCountries } from '../src/lib/countries';
import type { DiscoveryMeta, DiscoverySourceMeta, Professor, Publication, StudentProfile } from '../src/types';
import { readThroughCache } from './services/cache';
import { fetchSourcePreview, inferSourceTypeFromUrl } from './services/faculty-page';
import { type CandidateAuthor, type OpenAlexAuthor, type OpenAlexWork, fetchOpenAlexAuthor, fetchOpenAlexAuthorWorks, searchCandidateAuthors } from './services/openalex';
import { fetchOrcidRecord, getCurrentEmployment, getResearcherUrls, normalizeOrcid, type OrcidEmploymentSummary, type OrcidRecord } from './services/orcid';
import { fetchSemanticScholarAuthor, type SemanticScholarAuthor } from './services/semantic-scholar';

const CURRENT_YEAR = new Date().getFullYear();
const DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DISCOVERY_CACHE_NAMESPACE = 'discovery-profile-v3';

type DiscoveryBuildResult = {
  professor: Professor;
  sourceSignals: {
    orcid: boolean;
    semanticScholar: boolean;
    facultyPageUrl: boolean;
    facultyPageFetched: boolean;
  };
};

const METHOD_PATTERNS: Array<{ method: Publication['methods'][number]; patterns: RegExp[] }> = [
  { method: 'fMRI', patterns: [/\bfmri\b/i, /functional magnetic resonance/i, /monetary incentive delay/i] },
  { method: 'EEG', patterns: [/\beeg\b/i, /electroencephal/i] },
  { method: 'TMS', patterns: [/\btms\b/i, /transcranial magnetic stimulation/i] },
  { method: 'Survey Methods', patterns: [/\bsurvey\b/i, /questionnaire/i, /\bself-report\b/i] },
  { method: 'Qualitative Interviews', patterns: [/\binterview/i, /\bqualitative\b/i] },
  { method: 'Computational Modeling', patterns: [/\bcomputational\b/i, /\bmodel(?:ing)?\b/i, /reinforcement learning/i, /drift diffusion/i] },
  { method: 'Machine Learning', patterns: [/\bmachine learning\b/i, /\bdeep learning\b/i, /\bneural network/i] },
  { method: 'RCTs', patterns: [/\brandomized\b/i, /\btrial\b/i, /\brct\b/i, /clinical trial/i] },
  { method: 'Field Experiments', patterns: [/\bfield experiment/i, /\bintervention\b/i, /\bprogram evaluation\b/i] },
  { method: 'Animal Models', patterns: [/\brat\b/i, /\bmouse\b/i, /\banimal model/i, /\bprimate\b/i] },
  { method: 'Neuroimaging', patterns: [/\bneuroimaging\b/i, /\bpet\b/i, /\bmri\b/i, /\bbrain imaging\b/i] },
  { method: 'Longitudinal Analysis', patterns: [/\blongitudinal\b/i, /\bpanel\b/i, /\bcohort\b/i] },
  { method: 'Social Network Analysis', patterns: [/\bnetwork\b/i, /\bsocial graph\b/i] },
];

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function compact<T>(values: Array<T | null | undefined | false>) {
  return values.filter(Boolean) as T[];
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function buildTextPool(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function decodeAbstract(abstractInvertedIndex?: Record<string, number[]>) {
  if (!abstractInvertedIndex) {
    return undefined;
  }

  const pairs = Object.entries(abstractInvertedIndex)
    .flatMap(([word, positions]) => positions.map((position) => [position, word] as const))
    .sort((left, right) => left[0] - right[0]);

  return normalizeWhitespace(pairs.map(([, word]) => word).join(' ')) || undefined;
}

function inferMethods(text: string) {
  return METHOD_PATTERNS
    .filter(({ patterns }) => patterns.some((pattern) => pattern.test(text)))
    .map(({ method }) => method)
    .slice(0, 3);
}

function buildDiscoveryCacheKey(profile: StudentProfile) {
  return JSON.stringify({
    field: profile.field.trim().toLowerCase(),
    interests: profile.researchInterests.trim().toLowerCase(),
    methods: [...profile.methods].sort(),
    preferredCountries: normalizePreferredCountries((profile as Partial<StudentProfile>).preferredCountries).sort(),
    careerGoal: profile.careerGoal,
  });
}

function pickBestProfileUrl(orcidRecord: OrcidRecord | null, semanticScholarAuthor: SemanticScholarAuthor | null) {
  const ranked = unique([
    ...getResearcherUrls(orcidRecord),
    semanticScholarAuthor?.homepage?.trim(),
  ].filter(Boolean) as string[]);

  return ranked.find((url) => !url.includes('scholar.google.com') && !url.includes('semanticscholar.org')) ?? null;
}

function pickPreferredInstitution(author: OpenAlexAuthor) {
  return (author.last_known_institutions ?? []).find((institution) => institution.type === 'education')
    ?? (author.last_known_institutions ?? []).find((institution) => institution.type === 'healthcare')
    ?? author.last_known_institutions?.[0];
}

function pickInstitution(author: OpenAlexAuthor, employment: OrcidEmploymentSummary | undefined, candidate: CandidateAuthor) {
  const preferredInstitution = pickPreferredInstitution(author);

  if (preferredInstitution?.display_name) {
    return preferredInstitution.display_name;
  }

  if (employment?.organization?.name) {
    return employment.organization.name;
  }

  return candidate.institutionHints[0] ?? 'Affiliation not available';
}

function pickCountryCode(author: OpenAlexAuthor, candidate: CandidateAuthor) {
  const preferredInstitution = pickPreferredInstitution(author);
  return preferredInstitution?.country_code?.trim().toUpperCase() ?? candidate.countryHints[0];
}

function pickDepartment(author: OpenAlexAuthor, employment: OrcidEmploymentSummary | undefined) {
  if (employment?.['department-name']) {
    return employment['department-name'];
  }

  const primaryTopic = author.topics?.[0];
  return primaryTopic?.subfield?.display_name
    ?? primaryTopic?.field?.display_name
    ?? 'Interdisciplinary Research';
}

function buildMetricsHighlight(author: OpenAlexAuthor) {
  const worksCount = author.works_count ?? 0;
  const citedBy = author.cited_by_count ?? 0;
  const hIndex = author.summary_stats?.h_index;

  const parts = compact([
    worksCount > 0 ? `${worksCount} works indexed in OpenAlex` : null,
    citedBy > 0 ? `${citedBy.toLocaleString()} citations` : null,
    hIndex ? `h-index ${hIndex}` : null,
  ]);

  return parts.length > 0 ? parts.join(' • ') : null;
}

function buildTopicHighlight(author: OpenAlexAuthor) {
  const topics = compact(author.topics?.slice(0, 3).map((topic) => topic.display_name));
  return topics.length > 0 ? `Recent work clusters around ${topics.join(', ')}.` : null;
}

function buildEmploymentHighlight(employment: OrcidEmploymentSummary | undefined) {
  if (!employment?.organization?.name) {
    return null;
  }

  const role = employment['role-title'] ?? 'Researcher';
  const department = employment['department-name'];
  return department
    ? `${role} in ${department} at ${employment.organization.name}.`
    : `${role} at ${employment.organization.name}.`;
}

function buildSemanticScholarHighlight(semanticScholarAuthor: SemanticScholarAuthor | null) {
  if (!semanticScholarAuthor) {
    return null;
  }

  const parts = compact([
    semanticScholarAuthor.paperCount ? `${semanticScholarAuthor.paperCount} papers in Semantic Scholar` : null,
    semanticScholarAuthor.citationCount ? `${semanticScholarAuthor.citationCount.toLocaleString()} citations` : null,
    semanticScholarAuthor.hIndex ? `h-index ${semanticScholarAuthor.hIndex}` : null,
  ]);

  return parts.length > 0 ? parts.join(' • ') : null;
}

function buildKeywords(work: OpenAlexWork) {
  return unique([
    ...(work.keywords ?? []).map((keyword) => keyword.display_name).filter(Boolean) as string[],
    ...(work.topics ?? []).map((topic) => topic.display_name).filter(Boolean) as string[],
  ]).slice(0, 5);
}

function mapOpenAlexWorkToPublication(work: OpenAlexWork, professorName: string): Publication {
  const abstract = decodeAbstract(work.abstract_inverted_index);
  const keywords = buildKeywords(work);
  const methods = inferMethods(buildTextPool([work.display_name, abstract, keywords.join(' ')]));

  return {
    id: work.id,
    title: work.display_name ?? 'Untitled publication',
    abstract,
    year: work.publication_year ?? CURRENT_YEAR,
    venue: work.primary_location?.source?.display_name,
    keywords,
    methods,
    coauthors: unique(
      compact(
        work.authorships?.map((authorship) => authorship.author?.display_name).filter((name) => name && name !== professorName)
      )
    ).slice(0, 4),
  };
}

function buildSourceSummary(orcidRecord: OrcidRecord | null, semanticScholarAuthor: SemanticScholarAuthor | null, previewUrl: string | null, previewFetched: boolean) {
  const parts = ['OpenAlex author and works data'];

  if (orcidRecord) {
    parts.push('ORCID public record');
  }

  if (semanticScholarAuthor) {
    parts.push('Semantic Scholar author graph');
  }

  if (previewUrl) {
    parts.push(previewFetched ? 'faculty or lab page metadata' : 'faculty or lab page URL');
  }

  return `Discovered from ${parts.join(', ')}.`;
}

function buildBio(name: string, institution: string, department: string, author: OpenAlexAuthor, orcidRecord: OrcidRecord | null, previewDescription?: string) {
  const topics = compact(author.topics?.slice(0, 3).map((topic) => topic.display_name));
  const bioFromOrcid = orcidRecord?.person?.biography?.content?.trim();

  return normalizeWhitespace([
    `${name} is affiliated with ${institution} in ${department}.`,
    bioFromOrcid,
    topics.length > 0 ? `OpenAlex topics include ${topics.join(', ')}.` : '',
    previewDescription,
  ].filter(Boolean).join(' '));
}

async function buildDiscoveredProfessor(candidate: CandidateAuthor, preferredCountries: string[]): Promise<DiscoveryBuildResult | null> {
  const [author, works] = await Promise.all([
    fetchOpenAlexAuthor(candidate.authorId),
    fetchOpenAlexAuthorWorks(candidate.authorId),
  ]);

  if (works.length === 0) {
    return null;
  }

  const orcidId = normalizeOrcid(author.orcid ?? candidate.orcid);
  const orcidRecord = orcidId ? await fetchOrcidRecord(orcidId) : null;
  const employment = getCurrentEmployment(orcidRecord);
  const institution = pickInstitution(author, employment, candidate);
  const countryCode = pickCountryCode(author, candidate);

  if (preferredCountries.length > 0 && (!countryCode || !preferredCountries.includes(countryCode))) {
    return null;
  }

  const semanticScholarAuthor = await fetchSemanticScholarAuthor(author.display_name ?? candidate.displayName, institution);
  const previewUrl = pickBestProfileUrl(orcidRecord, semanticScholarAuthor);
  const preview = previewUrl ? await fetchSourcePreview(previewUrl) : null;
  const sourceType = preview?.sourceType ?? (previewUrl ? inferSourceTypeFromUrl(previewUrl) : (orcidId ? 'ORCID' : undefined));
  const department = pickDepartment(author, employment);

  const urls: Professor['urls'] = {
    orcid: orcidId ? `https://orcid.org/${orcidId}` : undefined,
    scholar: undefined,
    faculty: previewUrl && sourceType !== 'Lab Page' ? previewUrl : undefined,
    lab: previewUrl && sourceType === 'Lab Page' ? previewUrl : undefined,
  };

  const highlights = unique(
    compact([
      buildEmploymentHighlight(employment),
      buildMetricsHighlight(author),
      buildTopicHighlight(author),
      buildSemanticScholarHighlight(semanticScholarAuthor),
      preview?.description,
    ])
  ).slice(0, 3);

  return {
    professor: {
      id: `openalex-${candidate.authorId.toLowerCase()}`,
      fullName: author.display_name ?? candidate.displayName,
      institution,
      department,
      country: getCountryLabel(countryCode),
      countryCode,
      profileOrigin: 'discovery',
      sourceType,
      sourceConfidence: clamp(
        0.56
          + (orcidRecord ? 0.12 : 0)
          + (semanticScholarAuthor ? 0.08 : 0)
          + (preview?.fetched ? 0.12 : 0)
          + (works.length >= 4 ? 0.06 : 0),
        0.45,
        0.96,
      ),
      sourceSummary: buildSourceSummary(orcidRecord, semanticScholarAuthor, previewUrl, preview?.fetched ?? false),
      sourceFetched: Boolean(orcidRecord || semanticScholarAuthor || preview?.fetched),
      highlights,
      urls,
      bio: buildBio(author.display_name ?? candidate.displayName, institution, department, author, orcidRecord, preview?.description),
      publications: works.map((work) => mapOpenAlexWorkToPublication(work, author.display_name ?? candidate.displayName)),
    },
    sourceSignals: {
      orcid: Boolean(orcidRecord),
      semanticScholar: Boolean(semanticScholarAuthor),
      facultyPageUrl: Boolean(previewUrl),
      facultyPageFetched: Boolean(preview?.fetched),
    },
  };
}

function buildSourceMeta({
  totalResults,
  totalCandidates,
  builtResults,
}: {
  totalResults: number;
  totalCandidates: number;
  builtResults: DiscoveryBuildResult[];
}): DiscoveryMeta {
  const semanticScholarEnabled = Boolean(process.env.SEMANTIC_SCHOLAR_API_KEY);
  const orcidCount = builtResults.filter((result) => result.sourceSignals.orcid).length;
  const semanticScholarCount = builtResults.filter((result) => result.sourceSignals.semanticScholar).length;
  const facultyUrlCount = builtResults.filter((result) => result.sourceSignals.facultyPageUrl).length;
  const facultyFetchedCount = builtResults.filter((result) => result.sourceSignals.facultyPageFetched).length;

  const sources: DiscoverySourceMeta[] = [
    {
      source: 'openAlex',
      status: totalResults > 0 ? 'success' : 'degraded',
      detail: totalResults > 0
        ? `Built ${totalResults} ranked profiles from ${totalCandidates} OpenAlex author candidates.`
        : 'OpenAlex returned no usable researcher candidates for this profile.',
    },
    {
      source: 'orcid',
      status: orcidCount === 0 ? 'degraded' : orcidCount === totalResults ? 'success' : 'degraded',
      detail: orcidCount > 0
        ? `ORCID enriched ${orcidCount}/${totalResults} discovered profiles.`
        : 'No public ORCID records were linked for the discovered profiles.',
    },
    {
      source: 'semanticScholar',
      status: !semanticScholarEnabled ? 'skipped' : semanticScholarCount === 0 ? 'degraded' : semanticScholarCount === totalResults ? 'success' : 'degraded',
      detail: !semanticScholarEnabled
        ? 'Semantic Scholar enrichment is disabled because no API key is configured.'
        : semanticScholarCount > 0
          ? `Semantic Scholar enriched ${semanticScholarCount}/${totalResults} discovered profiles.`
          : 'Semantic Scholar enrichment was unavailable or rate-limited for this run.',
    },
    {
      source: 'facultyPages',
      status: facultyFetchedCount === 0 ? (facultyUrlCount > 0 ? 'degraded' : 'skipped') : facultyFetchedCount === facultyUrlCount ? 'success' : 'degraded',
      detail: facultyFetchedCount > 0
        ? `Fetched readable faculty or lab page metadata for ${facultyFetchedCount}/${Math.max(facultyUrlCount, 1)} discovered profiles with public URLs.`
        : facultyUrlCount > 0
          ? 'Public faculty or lab URLs were found, but metadata fetches degraded during this run.'
          : 'No public faculty or lab pages were available from ORCID or Semantic Scholar links.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    candidateCount: totalCandidates,
    resultCount: totalResults,
    sources,
  };
}

export async function discoverAcademicProfessors(studentProfile: StudentProfile) {
  const preferredCountries = normalizePreferredCountries((studentProfile as Partial<StudentProfile>).preferredCountries);

  return readThroughCache({
    namespace: DISCOVERY_CACHE_NAMESPACE,
    key: buildDiscoveryCacheKey(studentProfile),
    ttlMs: DISCOVERY_CACHE_TTL_MS,
    loader: async () => {
      const candidates = await searchCandidateAuthors(studentProfile);
      const results = await Promise.allSettled(candidates.map((candidate) => buildDiscoveredProfessor(candidate, preferredCountries)));
      const builtResults = results.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []));
      const professors = builtResults.map((result) => result.professor);
      const discoveryMeta = buildSourceMeta({
        totalResults: professors.length,
        totalCandidates: candidates.length,
        builtResults,
      });

      return { professors, discoveryMeta };
    },
    shouldCache: (value) => value.professors.length > 0,
  });
}
