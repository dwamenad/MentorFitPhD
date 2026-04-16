import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { buildProfessorProfile, computeMatch } from "./src/lib/mentor-engine";
import { fetchSourcePreview } from "./src/lib/source-preview";
import type { StudentProfile } from "./src/types";

function isStudentProfile(value: unknown): value is StudentProfile {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as StudentProfile;
  return Boolean(candidate.id && candidate.name && candidate.field && candidate.researchInterests && candidate.preferences);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post('/api/ingest-profile', async (req, res) => {
    const { url, studentProfile } = req.body ?? {};

    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'A public profile URL is required.' });
    }

    if (!isStudentProfile(studentProfile)) {
      return res.status(400).json({ error: 'A valid student profile is required before ingesting mentors.' });
    }

    try {
      const parsedUrl = new URL(url);
      const preview = await fetchSourcePreview(parsedUrl.toString());
      const professor = buildProfessorProfile(parsedUrl.toString(), preview, studentProfile);
      const match = computeMatch(studentProfile, professor, preview);

      res.json({ professor, match, preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process this URL.';
      res.status(400).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
