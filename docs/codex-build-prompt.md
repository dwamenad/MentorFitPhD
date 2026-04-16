# Codex Build Prompt: MentorFit MVP

Use this document as the source of truth for turning the current UI demo into a buildable MVP. The repo already contains the front-end shell. The next phase is to replace demo-only client-side AI calls with a backend-driven ingestion, scoring, and explanation pipeline.

## Mission

Build an MVP that lets a student:

1. Create a profile from onboarding inputs plus optional CV and SOP text.
2. Submit professor source links such as Google Scholar, ORCID, faculty page, and lab page.
3. Ingest and reconcile those sources into a single professor profile.
4. Compute interpretable fit scores across seven dimensions.
5. Show ranked results, comparison views, confidence, limitations, and partial-data states.

The product is decision support, not admissions prediction and not a universal faculty directory.

## Current Repo Baseline

Keep these UI surfaces and evolve them rather than rebuilding from scratch:

- [src/components/Onboarding.tsx](/Users/kwakufinest/Downloads/mentormatch-phd/src/components/Onboarding.tsx)
- [src/components/Dashboard.tsx](/Users/kwakufinest/Downloads/mentormatch-phd/src/components/Dashboard.tsx)
- [src/components/ProfessorCard.tsx](/Users/kwakufinest/Downloads/mentormatch-phd/src/components/ProfessorCard.tsx)
- [src/components/ComparisonView.tsx](/Users/kwakufinest/Downloads/mentormatch-phd/src/components/ComparisonView.tsx)
- [src/components/RadarChart.tsx](/Users/kwakufinest/Downloads/mentormatch-phd/src/components/RadarChart.tsx)

Important constraint: remove the current pattern where [Dashboard.tsx](/Users/kwakufinest/Downloads/mentormatch-phd/src/components/Dashboard.tsx) asks Gemini to invent or infer professor data. For the MVP, missing data must remain missing. Do not hallucinate professor biographies, publications, or mentorship evidence.

## Target Architecture

Use the current React app as the client. Move all ingestion and scoring into backend services.

Recommended target structure:

```text
mentorfit/
  docs/
    codex-build-prompt.md
  prisma/
    schema.prisma
  server/
    app.ts
    routes/
      studentProfiles.ts
      professors.ts
      matches.ts
      uploads.ts
      jobs.ts
    services/
      ingestion/
        sourceFetchers/
          googleScholar.ts
          orcid.ts
          facultyPage.ts
          labPage.ts
          crossref.ts
        identityResolution.ts
        extractProfessorProfile.ts
        methodsDictionary.ts
      scoring/
        computeMatch.ts
        normalize.ts
        explanation.ts
      uploads/
        extractText.ts
      jobs/
        enqueue.ts
        poll.ts
    types/
      api.ts
      domain.ts
  src/
    components/
    hooks/
      useIngestionJob.ts
      useMatches.ts
    lib/
      api.ts
```

If you keep Firebase auth for MVP, that is acceptable. If you do, treat Firebase only as auth and move product data into Postgres with Prisma so ingestion and scoring can be modeled cleanly.

## Build Order

1. Add Prisma schema and migrations.
2. Move professor ingestion into async backend jobs.
3. Implement identity resolution before profile merge.
4. Implement methods extraction and normalized subscores.
5. Add explanation generation with hard constraints.
6. Rewire the frontend to poll job status and render partial, failed, and low-confidence states.
7. Add unit tests for scoring, identity resolution, and methods mapping.

## Product Boundaries

Must do:

- Student onboarding
- Optional CV and SOP ingestion
- Manual professor link input
- Ranked results
- Compare up to four professors
- Confidence and limitations per match
- Delete uploaded data

Do not do in MVP:

- Admissions probability
- Automatic crawling of entire university departments
- Reputation or star ratings
- Social reviews of professors
- Hidden black-box scoring without explanations

## Data Model

Use Prisma. A concise MVP schema is below.

```prisma
model User {
  id              String           @id @default(cuid())
  authProviderId  String           @unique
  email           String?          @unique
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  studentProfiles StudentProfile[]
  uploads         Upload[]
}

model StudentProfile {
  id                  String        @id @default(cuid())
  userId              String
  name                String
  field               String
  researchInterests   String
  careerGoal          CareerGoal
  cvText              String?
  sopText             String?
  methods             String[]
  preferenceWeights   Json
  createdAt           DateTime      @default(now())
  updatedAt           DateTime      @updatedAt
  user                User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  matches             MatchResult[]
}

model Professor {
  id                    String             @id @default(cuid())
  canonicalName         String
  primaryInstitution    String?
  department            String?
  bio                   String?
  researchSummary       String?
  identityConfidence    Float              @default(0)
  profileConfidence     Float              @default(0)
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt
  externalIdentities    ExternalIdentity[]
  sourceSnapshots       SourceSnapshot[]
  publications          Publication[]
  matches               MatchResult[]
}

model ExternalIdentity {
  id               String        @id @default(cuid())
  professorId      String
  sourceType       SourceType
  sourceUrl        String
  sourceHandle     String?
  externalId       String?
  confidence       Float
  createdAt        DateTime      @default(now())
  professor        Professor     @relation(fields: [professorId], references: [id], onDelete: Cascade)

  @@unique([sourceType, sourceUrl])
}

model SourceSnapshot {
  id               String        @id @default(cuid())
  professorId      String
  sourceType       SourceType
  sourceUrl        String
  rawText          String?
  parsedJson       Json?
  fetchStatus      JobStatus
  fetchedAt        DateTime?
  createdAt        DateTime      @default(now())
  professor        Professor     @relation(fields: [professorId], references: [id], onDelete: Cascade)
}

model Publication {
  id               String        @id @default(cuid())
  professorId      String
  title            String
  abstract         String?
  year             Int?
  venue            String?
  doi              String?
  url              String?
  keywords         String[]
  methods          String[]
  coauthors        String[]
  sourceConfidence Float         @default(0)
  professor        Professor     @relation(fields: [professorId], references: [id], onDelete: Cascade)
}

model MatchResult {
  id                      String         @id @default(cuid())
  studentProfileId        String
  professorId             String
  overallScore            Int
  topicScore              Int?
  methodsScore            Int?
  trajectoryScore         Int?
  activityScore           Int?
  networkScore            Int?
  mentorshipScore         Int?
  careerAlignmentScore    Int?
  explanation             String
  limitation              String?
  confidence              Float
  scoreVersion            String
  createdAt               DateTime       @default(now())
  updatedAt               DateTime       @updatedAt
  studentProfile          StudentProfile @relation(fields: [studentProfileId], references: [id], onDelete: Cascade)
  professor               Professor      @relation(fields: [professorId], references: [id], onDelete: Cascade)

  @@unique([studentProfileId, professorId, scoreVersion])
}

model Upload {
  id               String        @id @default(cuid())
  userId           String
  uploadType       UploadType
  originalFileName String
  extractedText    String
  createdAt        DateTime      @default(now())
  deletedAt        DateTime?
  user             User          @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum CareerGoal {
  Academic
  Industry
  Policy
  Other
}

enum SourceType {
  GOOGLE_SCHOLAR
  ORCID
  FACULTY_PAGE
  LAB_PAGE
  CROSSREF
  RESEARCHGATE
}

enum UploadType {
  CV
  SOP
}

enum JobStatus {
  PENDING
  RUNNING
  SUCCEEDED
  PARTIAL
  FAILED
}
```

## Identity Resolution

This is mandatory. Multiple links can refer to the same professor, and similar names can refer to different people.

Inputs:

- Source URL
- Parsed name
- Institution
- Department
- Publication titles and years
- ORCID if present

Matching procedure:

1. If ORCID matches an existing professor, link directly and set `identityConfidence = 1.0`.
2. Otherwise generate candidate professors by normalized last name plus institution overlap.
3. Score each candidate using:

```text
identity_match_score =
  0.40 * name_similarity +
  0.20 * institution_similarity +
  0.10 * department_similarity +
  0.20 * publication_overlap +
  0.10 * url_domain_overlap
```

Definitions:

- `name_similarity`: normalized string similarity on full name, initials, and surname
- `institution_similarity`: exact match = `1`, fuzzy match = `0.5`, no match = `0`
- `department_similarity`: exact or token overlap based
- `publication_overlap`: overlap of normalized publication titles or DOI values
- `url_domain_overlap`: `1` if faculty or lab domain matches existing institutional domain

Thresholds:

- `>= 0.85`: auto-merge
- `0.65` to `0.84`: keep candidate set but require manual confirmation or show low-confidence banner
- `< 0.65`: create a new professor

Never merge on name alone.

## Source Ingestion Matrix

| Source | Method | Priority | Reliability | Data Extracted | Fallback |
| --- | --- | --- | --- | --- | --- |
| ORCID | Official API | High | High | canonical name, affiliation, works, ORCID id | use as identity anchor whenever present |
| Faculty page | HTML parsing | High | Medium | bio, department, advising text, students, contact info | fall back to lab page |
| Lab page | HTML parsing | High | Medium | research summary, lab members, projects, publications | fall back to faculty page |
| Google Scholar | scraper or proxy service | High | Medium | publications, citations, coauthors, recent activity | fall back to Crossref if blocked |
| Crossref | Official API | Medium | High | publication metadata, DOI enrichment, venue | enrich Scholar or faculty-publication lists |
| ResearchGate | scraping | Low | Low | supplemental publication and project hints | optional only, do not block pipeline |

Rules:

- Fetch ORCID first when available.
- Fetch faculty and lab pages next because they provide mentorship context.
- Fetch Scholar or Crossref for publication coverage.
- Persist each source snapshot even when parsing is partial.
- Mark each source result as `SUCCEEDED`, `PARTIAL`, or `FAILED`.
- Retry transient network failures up to `2` times with exponential backoff at `1s` and `3s`.
- Do not retry parsing failures more than once.
- If fewer than two high-priority sources succeed, complete the job as `PARTIAL` rather than failing outright.

## Methods Extraction

Use a controlled vocabulary plus aliases. Store canonical methods only.

Dictionary format:

```ts
type MethodEntry = {
  canonical: string;
  aliases: string[];
  category: 'data-collection' | 'analysis' | 'experimental' | 'computational';
};
```

Starter dictionary:

```ts
[
  { canonical: 'fMRI', aliases: ['fmri', 'functional mri', 'bold imaging'], category: 'data-collection' },
  { canonical: 'EEG', aliases: ['eeg', 'electroencephalography'], category: 'data-collection' },
  { canonical: 'Machine Learning', aliases: ['ml', 'deep learning', 'neural network'], category: 'computational' },
  { canonical: 'Computational Modeling', aliases: ['computational model', 'simulation model'], category: 'computational' },
  { canonical: 'Qualitative Interviews', aliases: ['interviews', 'semi-structured interviews'], category: 'data-collection' },
  { canonical: 'Survey Methods', aliases: ['survey', 'questionnaire'], category: 'data-collection' },
  { canonical: 'RCTs', aliases: ['randomized controlled trial', 'randomised controlled trial'], category: 'experimental' },
  { canonical: 'Longitudinal Analysis', aliases: ['longitudinal study', 'panel analysis'], category: 'analysis' }
]
```

Mapping rules:

1. Lowercase text and strip punctuation.
2. Try exact alias match first.
3. Try token containment second.
4. If still unmatched, allow fuzzy matching with a string similarity threshold of `0.88`.
5. If multiple canonical methods match, keep all with confidence scores.
6. Do not invent methods from generic text such as "advanced techniques" or "mixed methods" unless a canonical alias is present.

## Scoring Model

All subscores are normalized to `0-100`. Use fixed capped formulas so scores are stable across user sessions and do not change merely because the comparison set is smaller or larger.

Helpers:

```ts
const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const to100 = (value: number) => Math.round(clamp01(value) * 100);
```

### Topic Overlap

Create embeddings for:

- Student topic text = `field + researchInterests + cvText summary + sopText summary`
- Professor topic text = `bio + researchSummary + titles/abstracts from the most relevant 8 publications`

Formula:

```text
topic_similarity = cosine_similarity(student_topic_embedding, professor_topic_embedding)
topic_score = to100(topic_similarity)
```

If cosine output is `-1` to `1`, convert it first with `(topic_similarity + 1) / 2`.

### Methods Fit

Let `S` be the set of canonical student methods and `P` the set of canonical professor methods.

```text
methods_overlap = |S ∩ P| / |S ∪ P|
methods_score = to100(methods_overlap)
```

If the student has no methods selected, mark `methods_score` as missing and remove it from the overall denominator.

### Research Trajectory

Goal: reward professors whose recent work is moving toward the student's stated interests.

```text
recent_topic = average cosine similarity for publications from the last 3 years
older_topic = average cosine similarity for publications from years 4 to 8 ago
trend_signal = clamp01((recent_topic - older_topic + 0.25) / 0.50)
trajectory_score = to100(0.70 * recent_topic + 0.30 * trend_signal)
```

If there are fewer than `3` dated publications, mark as missing.

### Activity

Use recent publication output only for MVP.

```text
recent_publications = count(publications where year >= current_year - 3)
activity_score = to100(min(recent_publications, 12) / 12)
```

This caps strong activity at `12` recent publications.

### Network

Use coauthor and institution breadth as a proxy.

```text
coauthor_signal = min(distinct_coauthors_last_5_years, 20) / 20
institution_signal = min(distinct_coauthor_institutions_last_5_years, 8) / 8
network_score = to100(0.60 * coauthor_signal + 0.40 * institution_signal)
```

If coauthor data is unavailable, mark as missing.

### Mentorship Proxy

Use only observable evidence from faculty or lab pages.

```text
lab_members_signal = min(named_current_lab_members, 10) / 10
advising_signal = 1 if advising/trainee page exists else 0
outcomes_signal = min(named_alumni_outcomes, 5) / 5
mentorship_score = to100(0.50 * lab_members_signal + 0.30 * advising_signal + 0.20 * outcomes_signal)
```

If none of those signals exist, mark as missing. Do not infer mentorship quality from prestige.

### Career Alignment

Use the student's declared career goal.

```text
if Academic:
  career_alignment_score = round(0.40 * mentorship_score + 0.35 * network_score + 0.25 * activity_score)
if Industry:
  career_alignment_score = round(0.40 * methods_score + 0.30 * network_score + 0.30 * industry_collab_signal)
if Policy:
  career_alignment_score = round(0.40 * topic_score + 0.30 * network_score + 0.30 * policy_relevance_signal)
if Other:
  career_alignment_score = round(0.50 * topic_score + 0.25 * methods_score + 0.25 * mentorship_score)
```

For MVP:

- `industry_collab_signal = 1` if faculty or lab page shows named industry partners, else `0`
- `policy_relevance_signal = 1` if faculty or lab page shows named policy, government, or public-impact roles, else `0`

### Overall Score

Use user-defined weights from onboarding, but only over available subscores.

```text
available_dimensions = dimensions where score is not null
overall_score =
  sum(weight_i * score_i for available dimensions) /
  sum(weight_i for available dimensions)
```

Round to the nearest integer.

### Confidence

Confidence is separate from score. It reflects evidence quality, not fit.

```text
source_coverage = high_priority_sources_succeeded / high_priority_sources_expected
publication_coverage = min(publication_count, 8) / 8
subscore_coverage = available_subscores / 7
confidence =
  0.35 * identity_confidence +
  0.25 * source_coverage +
  0.20 * publication_coverage +
  0.20 * subscore_coverage
```

Clamp to `0-1`.

## Explanation Generation

Use an LLM only after the numeric scores have been computed. The explanation layer must not decide the score.

Constraints:

- Length: `80-120` words
- Tone: neutral and analytical
- Must reference at least `2` concrete subscores
- Must include exactly `1` limitation sentence
- Must not mention data that is absent from source snapshots
- Must not use promotional language such as "perfect match" or "dream advisor"

Required output shape:

```json
{
  "explanation": "string",
  "limitation": "string"
}
```

Prompt rule: feed the LLM the computed subscores, data availability flags, and the specific evidence snippets. Do not feed raw unbounded source dumps.

## Job Lifecycle, Latency, and UI States

Professor ingestion must be asynchronous.

Expected timings for MVP:

- Simple ORCID plus faculty page: `5-10s`
- Scholar plus Crossref enrichment: `10-20s`
- Faculty page with weak parsing or retries: `20-30s`

Job states:

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `PARTIAL`
- `FAILED`

Frontend requirements:

- Show a processing state immediately after URL submission.
- Poll the job endpoint every `2s` while status is `PENDING` or `RUNNING`.
- Show `Partial profile` if fewer than two high-priority sources succeed.
- Show `Low confidence` if `confidence < 0.60`.
- Show `No data found` when every source fails.
- Show a `Retry ingestion` action on `FAILED` or `PARTIAL`.
- Keep the professor card visible even when some subscores are missing.

## Error Handling

Backend errors must return structured JSON:

```json
{
  "error": {
    "code": "INGESTION_FAILED",
    "message": "Unable to parse any supported sources for this professor.",
    "retryable": true
  }
}
```

Use at least these error codes:

- `INVALID_URL`
- `UNSUPPORTED_SOURCE`
- `INGESTION_FAILED`
- `IDENTITY_CONFLICT`
- `UPLOAD_PARSE_FAILED`
- `MATCH_COMPUTE_FAILED`
- `UNAUTHORIZED`

## Validation Plan

Run a human validation pass before claiming the scores are useful.

Minimum loop:

1. Recruit `10` real or representative students.
2. Ask each student for a manual shortlist of `5-10` target mentors.
3. Run the app on the same set.
4. Measure:
   - overlap between manual shortlist and top `10` app results
   - whether explanations are trusted
   - whether missing-data warnings improve trust
   - whether comparison view changes final ranking decisions

Success criteria for MVP:

- at least `60%` of manually shortlisted mentors appear in the app's top `10`
- median explanation trust score of `4/5` or higher
- fewer than `10%` of profiles reported as clearly merged incorrectly

## Privacy and Data Handling

For CV and SOP uploads:

- Extract text server-side.
- Store extracted text, not raw files, whenever possible.
- If raw files must be stored temporarily, encrypt at rest and delete them within `15` minutes after extraction.
- Scope all uploads and derived data to the owning user.
- Provide deletion endpoints for uploads, profile text, professor lists, and matches.
- Never reuse one user's uploaded materials to enrich another user's results.

## API Contract

Use JSON over HTTP. These are the required MVP endpoints.

### `POST /api/student-profiles`

Creates or updates a student profile.

Request:

```json
{
  "name": "Alex Chen",
  "field": "Cognitive Neuroscience",
  "researchInterests": "I want to study memory consolidation and computational models of attention.",
  "methods": ["fMRI", "Computational Modeling"],
  "careerGoal": "Academic",
  "preferenceWeights": {
    "topic": 30,
    "methods": 20,
    "trajectory": 15,
    "activity": 10,
    "network": 10,
    "mentorship": 10,
    "careerAlignment": 5
  }
}
```

Response:

```json
{
  "id": "sp_123",
  "status": "saved"
}
```

### `POST /api/uploads`

Accepts a CV or SOP, extracts text, and attaches it to the active student profile.

Request:

```json
{
  "studentProfileId": "sp_123",
  "uploadType": "CV",
  "fileName": "alex-chen-cv.pdf",
  "base64Content": "..."
}
```

Response:

```json
{
  "uploadId": "up_123",
  "studentProfileId": "sp_123",
  "extractedChars": 8421,
  "status": "processed"
}
```

### `POST /api/professors/ingest`

Starts an async professor ingestion job.

Request:

```json
{
  "studentProfileId": "sp_123",
  "urls": [
    "https://scholar.google.com/citations?user=abc123",
    "https://orcid.org/0000-0002-1825-0097",
    "https://university.edu/faculty/jane-doe"
  ]
}
```

Response:

```json
{
  "jobId": "job_123",
  "status": "PENDING"
}
```

### `GET /api/jobs/:jobId`

Returns ingestion job state.

Response:

```json
{
  "jobId": "job_123",
  "status": "PARTIAL",
  "progress": 0.75,
  "professorId": "prof_123",
  "warnings": ["Google Scholar rate limited; Crossref enrichment used instead."]
}
```

### `GET /api/professors/:professorId`

Returns the normalized professor profile and source coverage.

Response:

```json
{
  "id": "prof_123",
  "canonicalName": "Jane Doe",
  "primaryInstitution": "Example University",
  "department": "Psychology",
  "researchSummary": "Focuses on memory, sleep, and computational modeling.",
  "identityConfidence": 0.93,
  "profileConfidence": 0.78,
  "sources": [
    { "type": "ORCID", "status": "SUCCEEDED" },
    { "type": "FACULTY_PAGE", "status": "SUCCEEDED" },
    { "type": "GOOGLE_SCHOLAR", "status": "PARTIAL" }
  ]
}
```

### `POST /api/matches/recompute`

Computes or refreshes matches for one or more professors.

Request:

```json
{
  "studentProfileId": "sp_123",
  "professorIds": ["prof_123", "prof_456"]
}
```

Response:

```json
{
  "matches": [
    {
      "professorId": "prof_123",
      "overallScore": 82,
      "subscores": {
        "topic": 88,
        "methods": 75,
        "trajectory": 81,
        "activity": 67,
        "network": 72,
        "mentorship": 60,
        "careerAlignment": 77
      },
      "confidence": 0.74,
      "explanation": "Jane Doe aligns strongly on topic overlap and recent trajectory, with publications that cluster around memory consolidation and computational attention models. Methods fit is solid but not perfect because the evidence leans more heavily on modeling than on fMRI. Network and activity are supportive rather than exceptional. Limitation: the public sources provide only partial evidence about advising history and trainee outcomes."
    }
  ]
}
```

### `GET /api/matches?studentProfileId=...`

Returns ranked matches for a student profile.

### `DELETE /api/uploads/:uploadId`

Deletes extracted upload text and any temporary file remnants.

## Frontend Wiring

Frontend responsibilities:

- Submit onboarding data through `src/lib/api.ts`
- Submit professor URLs to `POST /api/professors/ingest`
- Poll job status
- Recompute or fetch matches after ingestion completes
- Render score, confidence, warnings, and limitations
- Preserve the current comparison and radar chart experience

Required UI changes in the existing app:

- Replace direct Gemini calls in [src/components/Dashboard.tsx](/Users/kwakufinest/Downloads/mentormatch-phd/src/components/Dashboard.tsx) with API calls
- Add upload inputs for CV and SOP during onboarding
- Add banners for `Low confidence`, `Partial profile`, and `No data found`
- Add retry actions for ingestion failures
- Distinguish `score` from `confidence` visually

## Non-Negotiable Rules

- Never fabricate professor data.
- Never merge identities based only on name similarity.
- Never hide missing-data limitations.
- Never use the explanation LLM to choose scores.
- Never expose one user's uploads or derived data to another user.

## Definition of Done

The MVP is done when:

1. A student can create a profile, optionally upload CV and SOP text, and save weights.
2. A student can ingest at least one professor from real public URLs.
3. The backend produces normalized professor records with source snapshots and confidence.
4. Match scores are computed deterministically from stored evidence.
5. The frontend renders ranked results, compare view, confidence, and limitations.
6. Partial and failed ingestion states behave correctly.
7. Unit tests cover identity resolution, methods mapping, and scoring formulas.
