import { useEffect, useState, ReactNode } from 'react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './components/ui/button';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { Landing } from './components/Landing';
import { normalizePreferredCountries } from './lib/countries';
import { DiscoveryMeta, MatchResult, Professor, StudentProfile } from './types';
import { clearStored, readStored, STORAGE_KEYS, writeStored } from './lib/persistence';
import { hasDiscoveryPool, mergeDiscoveredProfessors, recomputeMatches, sanitizePersistedProfessors } from './lib/recommendations';

type DiscoverResponse = {
  professors?: Professor[];
  discoveryMeta?: DiscoveryMeta;
  error?: string;
};

function normalizeStudentProfile(profile: StudentProfile | null) {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    preferredCountries: normalizePreferredCountries((profile as Partial<StudentProfile>).preferredCountries),
  };
}

function ErrorBoundary({ children }: { children: ReactNode }) {
  const [errorState, setErrorState] = useState<{ hasError: boolean; error: unknown }>({ hasError: false, error: null });

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setErrorState({ hasError: true, error: event.error });
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (errorState.hasError) {
    const errorMessage = errorState.error instanceof Error ? errorState.error.message : 'Something went wrong.';

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card rounded-xl shadow-xl border border-border p-8 text-center">
          <div className="w-16 h-16 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-4">Application Error</h2>
          <p className="text-muted-foreground mb-8 leading-relaxed">{errorMessage}</p>
          <Button
            onClick={() => window.location.reload()}
            className="w-full bg-primary text-primary-foreground font-bold py-6 rounded-md"
          >
            <RefreshCw className="mr-2 w-4 h-4" /> Reload Application
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App() {
  const [{ initialStudentProfile, initialProfessors, initialDiscoveryMeta }] = useState(() => {
    const storedStudentProfile = normalizeStudentProfile(readStored<StudentProfile | null>(STORAGE_KEYS.studentProfile, null));
    const storedProfessors = sanitizePersistedProfessors(readStored<Professor[]>(STORAGE_KEYS.professors, []));
    const storedDiscoveryMeta = readStored<DiscoveryMeta | null>(STORAGE_KEYS.discoveryMeta, null);

    return {
      initialStudentProfile: storedStudentProfile,
      initialProfessors: storedProfessors,
      initialDiscoveryMeta: storedDiscoveryMeta,
    };
  });

  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(initialStudentProfile);
  const [professors, setProfessors] = useState<Professor[]>(initialProfessors);
  const [matches, setMatches] = useState<MatchResult[]>(() => recomputeMatches(initialStudentProfile, initialProfessors));
  const [discoveryMeta, setDiscoveryMeta] = useState<DiscoveryMeta | null>(initialDiscoveryMeta);
  const [isDiscoveringRecommendations, setIsDiscoveringRecommendations] = useState(false);
  const [hasBootstrappedDiscovery, setHasBootstrappedDiscovery] = useState(() => hasDiscoveryPool(initialProfessors));
  const [view, setView] = useState<'landing' | 'onboarding' | 'dashboard'>(() =>
    initialStudentProfile ? 'dashboard' : 'landing',
  );

  useEffect(() => {
    if (studentProfile) {
      writeStored(STORAGE_KEYS.studentProfile, studentProfile);
    } else {
      clearStored([STORAGE_KEYS.studentProfile]);
    }
  }, [studentProfile]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.professors, professors);
  }, [professors]);

  useEffect(() => {
    if (discoveryMeta) {
      writeStored(STORAGE_KEYS.discoveryMeta, discoveryMeta);
    } else {
      clearStored([STORAGE_KEYS.discoveryMeta]);
    }
  }, [discoveryMeta]);

  useEffect(() => {
    setMatches(recomputeMatches(studentProfile, professors));
  }, [studentProfile, professors]);

  useEffect(() => {
    writeStored(STORAGE_KEYS.matches, matches);
  }, [matches]);

  const refreshRecommendations = async (
    profile: StudentProfile,
    successMessage: string,
    fallbackErrorMessage: string,
  ) => {
    const response = await fetch('/api/discover-researchers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ studentProfile: profile }),
    });

    const payload = (await response.json()) as DiscoverResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? fallbackErrorMessage);
    }

    const discovered = payload.professors ?? [];
    if (discovered.length === 0) {
      throw new Error('No researcher candidates were returned from the academic discovery sources.');
    }

    setProfessors((current) => mergeDiscoveredProfessors(current, discovered));
    setDiscoveryMeta(payload.discoveryMeta ?? null);
    toast.success(successMessage);
  };

  useEffect(() => {
    if (!studentProfile || hasDiscoveryPool(professors) || isDiscoveringRecommendations || hasBootstrappedDiscovery) {
      return;
    }

    let cancelled = false;
    setHasBootstrappedDiscovery(true);

    const bootstrapDiscovery = async () => {
      setIsDiscoveringRecommendations(true);

      try {
        const response = await fetch('/api/discover-researchers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ studentProfile }),
        });

        const payload = (await response.json()) as DiscoverResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to build the academic discovery dataset.');
        }

        const discovered = payload.professors ?? [];
        if (discovered.length === 0) {
          throw new Error('No researcher candidates were returned from the academic discovery sources.');
        }

        if (cancelled) {
          return;
        }

        setProfessors((current) => mergeDiscoveredProfessors(current, discovered));
        setDiscoveryMeta(payload.discoveryMeta ?? null);
        toast.success(`Loaded ${discovered.length} researchers from academic sources.`);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Unable to load the academic discovery dataset.');
        }
      } finally {
        if (!cancelled) {
          setIsDiscoveringRecommendations(false);
        }
      }
    };

    void bootstrapDiscovery();

    return () => {
      cancelled = true;
    };
  }, [studentProfile, professors, isDiscoveringRecommendations, hasBootstrappedDiscovery]);

  const handleStart = () => {
    setView(studentProfile ? 'dashboard' : 'onboarding');
  };

  const handleOnboardingComplete = (profile: StudentProfile) => {
    const normalizedProfile = normalizeStudentProfile(profile);
    if (!normalizedProfile) {
      return;
    }

    setStudentProfile(normalizedProfile);
    setView('dashboard');
    setIsDiscoveringRecommendations(true);
    setHasBootstrappedDiscovery(true);

    void (async () => {
      try {
        await refreshRecommendations(
          normalizedProfile,
          'Profile saved. Loaded researchers from academic sources.',
          'Failed to build the academic discovery dataset.',
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Profile saved, but the academic dataset could not be refreshed.');
      } finally {
        setIsDiscoveringRecommendations(false);
      }
    })();
  };

  const updateProfessors = (next: Professor[]) => {
    setProfessors(next);
  };

  const updateMatches = (next: MatchResult[]) => {
    setMatches(next);
  };

  const handleReset = () => {
    setStudentProfile(null);
    setProfessors([]);
    setMatches([]);
    setDiscoveryMeta(null);
    setIsDiscoveringRecommendations(false);
    setHasBootstrappedDiscovery(false);
    clearStored([STORAGE_KEYS.studentProfile, STORAGE_KEYS.professors, STORAGE_KEYS.matches, STORAGE_KEYS.discoveryMeta]);
    setView('landing');
    toast.success('Saved session cleared.');
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground font-sans selection:bg-accent/15">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Landing onStart={handleStart} hasSavedProfile={Boolean(studentProfile)} />
            </motion.div>
          )}

          {view === 'onboarding' && (
            <motion.div key="onboarding" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <Onboarding onComplete={handleOnboardingComplete} initialData={studentProfile} />
            </motion.div>
          )}

          {view === 'dashboard' && studentProfile && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Dashboard
                studentProfile={studentProfile}
                professors={professors}
                setProfessors={updateProfessors}
                matches={matches}
                setMatches={updateMatches}
                discoveryMeta={discoveryMeta}
                isDiscoveringRecommendations={isDiscoveringRecommendations}
                onRefreshRecommendations={() => {
                  setIsDiscoveringRecommendations(true);
                  setHasBootstrappedDiscovery(true);

                  void (async () => {
                    try {
                      await refreshRecommendations(
                        studentProfile,
                        'Refreshed researchers from academic sources.',
                        'Failed to refresh the academic discovery dataset.',
                      );
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Unable to refresh the academic discovery dataset.');
                    } finally {
                      setIsDiscoveringRecommendations(false);
                    }
                  })();
                }}
                onEditProfile={() => setView('onboarding')}
                onLogout={handleReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <Toaster position="top-center" />
      </div>
    </ErrorBoundary>
  );
}
