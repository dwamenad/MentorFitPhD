import type { MatchResult, Professor, StudentProfile, SuccessStory } from '../types';

export const STORAGE_KEYS = {
  studentProfile: 'mentorfit.student-profile',
  professors: 'mentorfit.professors',
  matches: 'mentorfit.matches',
  stories: 'mentorfit.success-stories',
} as const;

function hasWindow() {
  return typeof window !== 'undefined';
}

export function readStored<T>(key: string, fallback: T): T {
  if (!hasWindow()) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored<T>(key: string, value: T) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function clearStored(keys: string[]) {
  if (!hasWindow()) {
    return;
  }

  keys.forEach((key) => window.localStorage.removeItem(key));
}

export type PersistedCoreState = {
  studentProfile: StudentProfile | null;
  professors: Professor[];
  matches: MatchResult[];
  stories: SuccessStory[];
};
