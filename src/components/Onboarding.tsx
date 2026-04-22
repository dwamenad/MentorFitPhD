import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StudentProfile, CareerGoal } from '@/types';
import { SUPPORTED_COUNTRIES, getCountryLabel, normalizePreferredCountries, type SupportedCountryCode } from '@/lib/countries';
import { ChevronRight, ChevronLeft, GraduationCap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ThemeToggle } from './ThemeToggle';

const METHODS_LIST = [
  'fMRI', 'EEG', 'TMS', 'Survey Methods', 'Qualitative Interviews', 
  'Computational Modeling', 'Machine Learning', 'RCTs', 'Field Experiments', 
  'Animal Models', 'Neuroimaging', 'Longitudinal Analysis', 'Social Network Analysis'
];

export function Onboarding({ onComplete, initialData }: { onComplete: (profile: StudentProfile) => void, initialData: StudentProfile | null }) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<StudentProfile>(initialData ? {
    ...initialData,
    preferredCountries: normalizePreferredCountries(initialData.preferredCountries),
  } : {
    id: crypto.randomUUID(),
    name: '',
    field: '',
    researchInterests: '',
    methods: [],
    preferredCountries: [],
    careerGoal: 'Academic',
    preferences: {
      topicOverlap: 30,
      methodsOverlap: 20,
      trajectory: 15,
      activity: 10,
      network: 10,
      mentorship: 10,
      careerAlignment: 5
    }
  });

  const next = () => setStep(s => s + 1);
  const prev = () => setStep(s => s - 1);

  const toggleMethod = (method: string) => {
    setProfile(p => ({
      ...p,
      methods: p.methods.includes(method) 
        ? p.methods.filter(m => m !== method)
        : [...p.methods, method]
    }));
  };

  const toggleCountry = (countryCode: SupportedCountryCode) => {
    setProfile((current) => ({
      ...current,
      preferredCountries: current.preferredCountries.includes(countryCode)
        ? current.preferredCountries.filter((code) => code !== countryCode)
        : [...current.preferredCountries, countryCode],
    }));
  };

  const totalWeight = (Object.values(profile.preferences) as number[]).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-2xl mx-auto px-6 py-20">
      <div className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-2 font-bold text-xl">
          <GraduationCap className="w-6 h-6 text-accent" />
          <span>MentorFit</span>
        </div>
        <ThemeToggle />
      </div>

      <div className="mb-12">
        <div className="flex gap-2 mb-4">
          {[1, 2, 3].map(i => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Step 0{step} of 03</p>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-4xl font-bold mb-2">Tell us about yourself.</h2>
              <p className="text-muted-foreground">This helps us understand your research context.</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold">What's your name?</label>
                <Input 
                  placeholder="e.g. Alex Chen" 
                  value={profile.name}
                  onChange={e => setProfile({...profile, name: e.target.value})}
                  className="rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Target Field / Discipline</label>
                <Input 
                  placeholder="e.g. Cognitive Neuroscience" 
                  value={profile.field}
                  onChange={e => setProfile({...profile, field: e.target.value})}
                  className="rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Career Goal after PhD</label>
                <Select 
                  value={profile.careerGoal} 
                  onValueChange={(v: CareerGoal) => setProfile({...profile, careerGoal: v})}
                >
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Select a goal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Academic">Academic (Professor/PI)</SelectItem>
                    <SelectItem value="Industry">Industry Research</SelectItem>
                    <SelectItem value="Policy">Policy / Government</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <label className="text-sm font-semibold">Preferred Countries</label>
                <p className="text-sm text-muted-foreground">
                  Optional. Limit discovery to researchers based in these countries.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUPPORTED_COUNTRIES.map((country) => (
                    <Badge
                      key={country.code}
                      variant={profile.preferredCountries.includes(country.code) ? "default" : "outline"}
                      className={`cursor-pointer px-3 py-1.5 rounded-md transition-all ${profile.preferredCountries.includes(country.code) ? 'bg-accent hover:bg-accent/90' : 'hover:border-accent/50'}`}
                      onClick={() => toggleCountry(country.code)}
                    >
                      {country.shortLabel}
                    </Badge>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {profile.preferredCountries.length > 0
                    ? `Filtering discovery to ${profile.preferredCountries.map((country) => getCountryLabel(country)).join(', ')}.`
                    : 'Leave all unselected to search across any available country.'}
                </p>
              </div>
            </div>

            <Button onClick={next} disabled={!profile.name || !profile.field} className="w-full bg-accent hover:bg-accent/90 text-accent-foreground rounded-md py-6 font-bold">
              Continue <ChevronRight className="ml-2 w-4 h-4" />
            </Button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-4xl font-bold mb-2">Research Interests.</h2>
              <p className="text-muted-foreground">Describe your specific interests and preferred methods.</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Research Interests (Free text)</label>
                <Textarea 
                  placeholder="Describe what you want to study in your PhD..." 
                  className="min-h-[150px] rounded-md"
                  value={profile.researchInterests}
                  onChange={e => setProfile({...profile, researchInterests: e.target.value})}
                />
              </div>
              <div className="space-y-4">
                <label className="text-sm font-semibold">Preferred Methods</label>
                <div className="flex flex-wrap gap-2">
                  {METHODS_LIST.map(m => (
                    <Badge 
                      key={m}
                      variant={profile.methods.includes(m) ? "default" : "outline"}
                      className={`cursor-pointer px-3 py-1.5 rounded-md transition-all ${profile.methods.includes(m) ? 'bg-accent hover:bg-accent/90' : 'hover:border-accent/50'}`}
                      onClick={() => toggleMethod(m)}
                    >
                      {m}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={prev} className="rounded-md px-6">
                <ChevronLeft className="mr-2 w-4 h-4" /> Back
              </Button>
              <Button onClick={next} disabled={!profile.researchInterests} className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground rounded-md py-6 font-bold">
                Continue <ChevronRight className="ml-2 w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div>
              <h2 className="text-4xl font-bold mb-2">Set your priorities.</h2>
              <p className="text-muted-foreground">What matters most to you in a potential mentor? Your weights must add up to exactly 100%.</p>
            </div>

            <div className="space-y-8 py-4">
              <WeightSlider 
                label="Topic Overlap" 
                value={profile.preferences.topicOverlap} 
                onChange={v => setProfile({...profile, preferences: {...profile.preferences, topicOverlap: v}})} 
              />
              <WeightSlider 
                label="Methods Fit" 
                value={profile.preferences.methodsOverlap} 
                onChange={v => setProfile({...profile, preferences: {...profile.preferences, methodsOverlap: v}})} 
              />
              <WeightSlider 
                label="Research Trajectory" 
                value={profile.preferences.trajectory} 
                onChange={v => setProfile({...profile, preferences: {...profile.preferences, trajectory: v}})} 
              />
              <WeightSlider 
                label="Mentorship Proxy" 
                value={profile.preferences.mentorship} 
                onChange={v => setProfile({...profile, preferences: {...profile.preferences, mentorship: v}})} 
              />
              
              <div className="pt-6 border-t border-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold">Total Allocation</span>
                  <span className={`text-lg font-extrabold ${
                    totalWeight === 100 
                      ? 'text-success' 
                      : 'text-destructive'
                  }`}>
                    {totalWeight}%
                  </span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      totalWeight === 100 
                        ? 'bg-success' 
                        : 'bg-destructive'
                    }`}
                    style={{ width: `${Math.min(totalWeight, 100)}%` }}
                  />
                </div>
                {totalWeight !== 100 && (
                  <p className="text-[10px] text-destructive mt-2 font-bold uppercase tracking-tight">
                    Please adjust weights to equal 100% to continue.
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <Button variant="outline" onClick={prev} className="rounded-md px-6">
                <ChevronLeft className="mr-2 w-4 h-4" /> Back
              </Button>
              <Button 
                onClick={() => onComplete(profile)} 
                disabled={totalWeight !== 100}
                className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground rounded-md py-6 font-bold"
              >
                Finish Profile
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WeightSlider({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-[10px] font-bold text-accent bg-accent/5 px-2 py-1 rounded">{value}%</span>
      </div>
      <Slider 
        value={value}
        onValueChange={onChange}
        max={100} 
        step={5} 
        className="[&_[role=slider]]:bg-accent"
      />
    </div>
  );
}
