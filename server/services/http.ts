type FetchWithPolicyOptions = {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIES = 2;
const USER_AGENT = 'MentorFit/1.0 (+http://localhost:3000)';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status: number) {
  return status === 429 || status >= 500;
}

function computeRetryDelay(attempt: number, retryAfterHeader: string | null) {
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, 8_000);
  }

  const baseDelay = 350 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(baseDelay + jitter, 4_000);
}

function buildError(status: number, url: string, body: string) {
  const message = body.trim().slice(0, 180);
  return new Error(`${url} responded with ${status}${message ? `: ${message}` : ''}`);
}

export async function fetchWithPolicy(rawUrl: string, init?: RequestInit, options?: FetchWithPolicyOptions) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options?.retries ?? DEFAULT_RETRIES;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(rawUrl, {
        ...init,
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          ...options?.headers,
          ...init?.headers,
        },
      });

      if (response.ok) {
        clearTimeout(timeout);
        return response;
      }

      if (attempt >= retries || !shouldRetryStatus(response.status)) {
        const body = await response.text();
        clearTimeout(timeout);
        throw buildError(response.status, rawUrl, body);
      }

      const retryDelay = computeRetryDelay(attempt, response.headers.get('retry-after'));
      clearTimeout(timeout);
      await delay(retryDelay);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;

      if (attempt >= retries) {
        break;
      }

      await delay(computeRetryDelay(attempt, null));
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(`Request failed for ${rawUrl}`);
}

export async function fetchJsonWithPolicy<T>(rawUrl: string, init?: RequestInit, options?: FetchWithPolicyOptions) {
  const response = await fetchWithPolicy(rawUrl, init, {
    ...options,
    headers: {
      accept: 'application/json',
      ...options?.headers,
    },
  });

  return (await response.json()) as T;
}

export async function fetchTextWithPolicy(rawUrl: string, init?: RequestInit, options?: FetchWithPolicyOptions) {
  const response = await fetchWithPolicy(rawUrl, init, {
    ...options,
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...options?.headers,
    },
  });

  return {
    body: await response.text(),
    contentType: response.headers.get('content-type') ?? '',
    ok: response.ok,
    status: response.status,
  };
}
