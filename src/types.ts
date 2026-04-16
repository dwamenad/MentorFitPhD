export type CareerGoal = 'Academic' | 'Industry' | 'Policy' | 'Other';
export type ProfessorSourceType = 'Google Scholar' | 'ORCID' | 'Faculty Page' | 'Lab Page' | 'Personal Website';

export interface StudentProfile {
  id: string;
  name: string;
  field: string;
  researchInterests: string;
  methods: string[];
  careerGoal: CareerGoal;
  preferences: {
    topicOverlap: number;
    methodsOverlap: number;
    trajectory: number;
    activity: number;
    network: number;
    mentorship: number;
    careerAlignment: number;
  };
}

export interface Professor {
  id: string;
  fullName: string;
  institution: string;
  department: string;
  sourceType?: ProfessorSourceType;
  sourceConfidence?: number;
  sourceSummary?: string;
  highlights?: string[];
  urls: {
    scholar?: string;
    orcid?: string;
    faculty?: string;
    lab?: string;
  };
  bio?: string;
  publications: Publication[];
}

export interface Publication {
  id: string;
  title: string;
  abstract?: string;
  year: number;
  venue?: string;
  keywords: string[];
  methods: string[];
  coauthors?: string[];
}

export interface MatchResult {
  professorId: string;
  overallScore: number;
  subscores: {
    topic: number;
    methods: number;
    trajectory: number;
    activity: number;
    network: number;
    mentorship: number;
    careerAlignment: number;
  };
  explanation: string;
  confidence: number;
  limitation?: string;
}

export interface SuccessStory {
  id: string;
  author: string;
  field: string;
  story: string;
  outcome: string;
  createdAt: string;
}
