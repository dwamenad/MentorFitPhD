import { useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { Landing } from './components/Landing';
import { Onboarding } from './components/Onboarding';
import type { StudentProfile } from './types';
import { STORAGE_KEYS, readStored, writeStored } from './lib/persistence';

export default function App() {
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(() =>
    readStored<StudentProfile | null>(STORAGE_KEYS.studentProfile, null),
  );
  const [view, setView] = useState<'landing' | 'onboarding'>('landing');

  useEffect(() => {
    if (studentProfile) {
      writeStored(STORAGE_KEYS.studentProfile, studentProfile);
    }
  }, [studentProfile]);

  const handleStart = () => {
    setView('onboarding');
  };

  const handleComplete = (profile: StudentProfile) => {
    setStudentProfile(profile);
    setView('landing');
    toast.success('Profile saved locally.');
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-accent/15">
      {view === 'landing' ? (
        <Landing onStart={handleStart} hasSavedProfile={Boolean(studentProfile)} />
      ) : (
        <Onboarding onComplete={handleComplete} initialData={studentProfile} />
      )}
      <Toaster position="top-center" />
    </div>
  );
}
