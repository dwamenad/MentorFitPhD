export default function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-20">
        <div className="max-w-2xl rounded-2xl border border-border bg-card p-10 shadow-sm">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-accent">MentorFit</p>
          <h1 className="text-4xl font-bold tracking-tight">Research mentor matching workspace</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            The full MentorFit client, onboarding flow, and deterministic scoring dashboard land in the next commits.
          </p>
        </div>
      </div>
    </main>
  );
}
