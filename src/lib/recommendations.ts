import { computeMatch } from './mentor-engine';
import type { MatchResult, Professor, StudentProfile } from '../types';

function cloneProfessor(professor: Professor): Professor {
  return {
    ...professor,
    urls: { ...professor.urls },
    highlights: professor.highlights ? [...professor.highlights] : undefined,
    publications: professor.publications.map((publication) => ({
      ...publication,
      keywords: [...publication.keywords],
      methods: [...publication.methods],
      coauthors: publication.coauthors ? [...publication.coauthors] : undefined,
    })),
  };
}

export function sanitizePersistedProfessors(professors: Professor[]) {
  return professors
    .filter((professor) => {
      const profileOrigin = (professor as { profileOrigin?: string }).profileOrigin;
      return profileOrigin === 'discovery' || profileOrigin === 'user' || profileOrigin === undefined;
    })
    .map(cloneProfessor);
}

export function hasDiscoveryPool(professors: Professor[]) {
  return professors.some((professor) => professor.profileOrigin === 'discovery');
}

export function getUserProfessors(professors: Professor[]) {
  return professors
    .filter((professor) => professor.profileOrigin === 'user' || professor.profileOrigin === undefined)
    .map(cloneProfessor);
}

export function mergeDiscoveredProfessors(existing: Professor[], discovered: Professor[]) {
  return [...discovered.map(cloneProfessor), ...getUserProfessors(existing)];
}

export function recomputeMatches(studentProfile: StudentProfile | null, professors: Professor[]): MatchResult[] {
  if (!studentProfile) {
    return [];
  }

  return professors.map((professor) => computeMatch(studentProfile, professor));
}
