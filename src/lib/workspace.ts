import type { DiscoveryMeta, Professor, StudentProfile, WorkspaceState } from '../types';
import { recomputeMatches, sanitizePersistedProfessors } from './recommendations';

const MAX_SHORTLIST_SIZE = 40;
const MAX_COMPARISON_SIZE = 4;

function unique(values: string[]) {
  return [...new Set(values)];
}

export function createEmptyWorkspaceState(): WorkspaceState {
  return {
    studentProfile: null,
    professors: [],
    matches: [],
    discoveryMeta: null,
    shortlistIds: [],
    comparisonIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function trimSelectionIds(ids: string[], professors: Professor[], limit: number, keepMostRecent = false) {
  const professorIds = new Set(professors.map((professor) => professor.id));
  const filtered = unique(ids.filter((id) => professorIds.has(id)));
  return keepMostRecent ? filtered.slice(-limit) : filtered.slice(0, limit);
}

export function buildWorkspaceState({
  studentProfile,
  professors,
  discoveryMeta,
  shortlistIds,
  comparisonIds,
}: {
  studentProfile: StudentProfile | null;
  professors: Professor[];
  discoveryMeta: DiscoveryMeta | null;
  shortlistIds: string[];
  comparisonIds: string[];
}): WorkspaceState {
  const cleanProfessors = sanitizePersistedProfessors(professors);

  return {
    studentProfile,
    professors: cleanProfessors,
    matches: recomputeMatches(studentProfile, cleanProfessors),
    discoveryMeta,
    shortlistIds: trimSelectionIds(shortlistIds, cleanProfessors, MAX_SHORTLIST_SIZE),
    comparisonIds: trimSelectionIds(comparisonIds, cleanProfessors, MAX_COMPARISON_SIZE, true),
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWorkspaceState(workspace: WorkspaceState | null | undefined) {
  if (!workspace) {
    return createEmptyWorkspaceState();
  }

  return buildWorkspaceState({
    studentProfile: workspace.studentProfile ?? null,
    professors: Array.isArray(workspace.professors) ? workspace.professors : [],
    discoveryMeta: workspace.discoveryMeta ?? null,
    shortlistIds: Array.isArray(workspace.shortlistIds) ? workspace.shortlistIds : [],
    comparisonIds: Array.isArray(workspace.comparisonIds) ? workspace.comparisonIds : [],
  });
}

export function isWorkspaceEmpty(workspace: WorkspaceState | null | undefined) {
  const candidate = workspace ?? createEmptyWorkspaceState();

  return !candidate.studentProfile
    && candidate.professors.length === 0
    && candidate.shortlistIds.length === 0
    && candidate.comparisonIds.length === 0;
}
