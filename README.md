# MentorFit

MentorFit is a local-first decision-support app for comparing potential PhD advisors. This build keeps the original UI direction, but removes Gemini and login requirements. Instead, it uses a deterministic ingest-and-score pipeline:

- paste a public Scholar, ORCID, lab, or faculty link
- fetch lightweight page metadata server-side
- infer a research track and publication profile
- score mentor fit with a fixed rubric
- save the profile, shortlist, and stories locally in the browser

## Screenshots

### Landing Page

![MentorFit landing page](./docs/screenshots/landing-light.png)

### Dashboard In Dark Mode

![MentorFit dashboard dark mode](./docs/screenshots/dashboard-dark.png)

## Run Locally

1. Install dependencies with `npm install`
2. Start the app with `npm run dev`
3. Open [http://localhost:3000](http://localhost:3000)

Useful commands:

- `npm run dev`
- `npm run build`
- `npm run lint`

## Current Build

- No Gemini dependency
- No authentication requirement
- Local storage persistence for the main workflow
- Deterministic scoring across topic, methods, trajectory, activity, network, mentorship, and career alignment
- Light and dark mode with theme persistence
- Express route for URL ingest and metadata preview

## Notes

This is still an MVP-style heuristic build. The ingest layer uses lightweight public metadata and deterministic templates, so names and mentorship signals can still be approximate on sparse pages. The longer-term engineering spec for a fuller backend version remains in [docs/codex-build-prompt.md](./docs/codex-build-prompt.md).
