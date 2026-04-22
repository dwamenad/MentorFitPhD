import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type ReadThroughCacheOptions<T> = {
  namespace: string;
  key: string;
  ttlMs: number;
  loader: () => Promise<T>;
  shouldCache?: (value: T) => boolean;
};

const CACHE_ROOT = path.join(process.cwd(), '.cache', 'mentorfit');
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightLoads = new Map<string, Promise<unknown>>();

function buildCompoundKey(namespace: string, key: string) {
  return `${namespace}:${key}`;
}

function buildCachePath(namespace: string, key: string) {
  const digest = createHash('sha1').update(buildCompoundKey(namespace, key)).digest('hex');
  return path.join(CACHE_ROOT, namespace, `${digest}.json`);
}

async function ensureCacheDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readDiskCache<T>(namespace: string, key: string) {
  const filePath = buildCachePath(namespace, key);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (parsed.expiresAt <= Date.now()) {
      await fs.unlink(filePath).catch(() => undefined);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function writeDiskCache<T>(namespace: string, key: string, entry: CacheEntry<T>) {
  const filePath = buildCachePath(namespace, key);
  await ensureCacheDirectory(filePath);
  await fs.writeFile(filePath, JSON.stringify(entry), 'utf8');
}

export async function readThroughCache<T>({
  namespace,
  key,
  ttlMs,
  loader,
  shouldCache = () => true,
}: ReadThroughCacheOptions<T>) {
  const compoundKey = buildCompoundKey(namespace, key);
  const now = Date.now();
  const memoryEntry = memoryCache.get(compoundKey) as CacheEntry<T> | undefined;

  if (memoryEntry && memoryEntry.expiresAt > now) {
    return memoryEntry.value;
  }

  const diskEntry = await readDiskCache<T>(namespace, key);
  if (diskEntry) {
    memoryCache.set(compoundKey, diskEntry);
    return diskEntry.value;
  }

  const inflight = inflightLoads.get(compoundKey) as Promise<T> | undefined;
  if (inflight) {
    return inflight;
  }

  const loadPromise = (async () => {
    const value = await loader();

    if (shouldCache(value)) {
      const entry: CacheEntry<T> = {
        expiresAt: now + ttlMs,
        value,
      };

      memoryCache.set(compoundKey, entry);
      await writeDiskCache(namespace, key, entry);
    }

    return value;
  })();

  inflightLoads.set(compoundKey, loadPromise);

  try {
    return await loadPromise;
  } finally {
    inflightLoads.delete(compoundKey);
  }
}
