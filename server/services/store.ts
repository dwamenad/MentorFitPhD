import { randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { SubscriptionStatus, WorkspaceState } from '../../src/types';

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  googleSubject?: string;
  createdAt: string;
  updatedAt: string;
  plan: 'free' | 'pro';
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  workspace: WorkspaceState | null;
};

type StoredSession = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type Database = {
  users: StoredUser[];
  sessions: StoredSession[];
};

const DATA_ROOT = path.join(process.cwd(), '.data', 'mentorfit');
const STORE_PATH = path.join(DATA_ROOT, 'store.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

let writeQueue = Promise.resolve();

function defaultDatabase(): Database {
  return {
    users: [],
    sessions: [],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function pruneExpiredSessions(database: Database) {
  const now = Date.now();
  database.sessions = database.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
}

async function ensureStoreFile() {
  await fs.mkdir(DATA_ROOT, { recursive: true });

  try {
    await fs.access(STORE_PATH);
  } catch {
    await fs.writeFile(STORE_PATH, JSON.stringify(defaultDatabase(), null, 2), 'utf8');
  }
}

async function readDatabaseFile() {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{}') as Partial<Database>;
  const database: Database = {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
  pruneExpiredSessions(database);
  return database;
}

async function writeDatabaseFile(database: Database) {
  const tempPath = `${STORE_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(database, null, 2), 'utf8');
  await fs.rename(tempPath, STORE_PATH);
}

async function withDatabase<T>(mutator: (database: Database) => Promise<T> | T): Promise<T> {
  const operation = writeQueue.then(async () => {
    const database = await readDatabaseFile();
    const result = await mutator(database);
    await writeDatabaseFile(database);
    return result;
  });

  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function readDatabase<T>(selector: (database: Database) => Promise<T> | T): Promise<T> {
  await writeQueue;
  const database = await readDatabaseFile();
  return selector(database);
}

export function createEmptyWorkspace(): WorkspaceState {
  return {
    studentProfile: null,
    professors: [],
    matches: [],
    discoveryMeta: null,
    shortlistIds: [],
    comparisonIds: [],
    updatedAt: new Date(0).toISOString(),
  };
}

export async function findUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);

  return readDatabase((database) => clone(database.users.find((user) => user.email === normalizedEmail) ?? null));
}

export async function findUserById(userId: string) {
  return readDatabase((database) => clone(database.users.find((user) => user.id === userId) ?? null));
}

export async function findUserByGoogleSubject(googleSubject: string) {
  return readDatabase((database) => clone(database.users.find((user) => user.googleSubject === googleSubject) ?? null));
}

export async function findUserByStripeCustomerId(stripeCustomerId: string) {
  return readDatabase((database) => clone(database.users.find((user) => user.stripeCustomerId === stripeCustomerId) ?? null));
}

export async function createPasswordUser({
  email,
  name,
  passwordHash,
}: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const normalizedEmail = normalizeEmail(email);

  return withDatabase((database) => {
    if (database.users.some((user) => user.email === normalizedEmail)) {
      throw new Error('An account with that email already exists.');
    }

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: randomUUID(),
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      createdAt: now,
      updatedAt: now,
      plan: 'free',
      subscriptionStatus: 'inactive',
      workspace: createEmptyWorkspace(),
    };

    database.users.push(user);
    return clone(user);
  });
}

export async function upsertGoogleUser({
  email,
  name,
  googleSubject,
}: {
  email: string;
  name: string;
  googleSubject: string;
}) {
  const normalizedEmail = normalizeEmail(email);

  return withDatabase((database) => {
    const existingBySubject = database.users.find((user) => user.googleSubject === googleSubject);
    if (existingBySubject) {
      existingBySubject.email = normalizedEmail;
      existingBySubject.name = name.trim() || existingBySubject.name;
      existingBySubject.updatedAt = new Date().toISOString();
      return clone(existingBySubject);
    }

    const existingByEmail = database.users.find((user) => user.email === normalizedEmail);
    if (existingByEmail) {
      existingByEmail.googleSubject = googleSubject;
      existingByEmail.name = name.trim() || existingByEmail.name;
      existingByEmail.updatedAt = new Date().toISOString();
      return clone(existingByEmail);
    }

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: randomUUID(),
      email: normalizedEmail,
      name: name.trim() || normalizedEmail.split('@')[0],
      googleSubject,
      createdAt: now,
      updatedAt: now,
      plan: 'free',
      subscriptionStatus: 'inactive',
      workspace: createEmptyWorkspace(),
    };

    database.users.push(user);
    return clone(user);
  });
}

export async function updateUser(userId: string, mutator: (user: StoredUser) => void) {
  return withDatabase((database) => {
    const user = database.users.find((entry) => entry.id === userId);
    if (!user) {
      return null;
    }

    mutator(user);
    user.updatedAt = new Date().toISOString();
    return clone(user);
  });
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

  await withDatabase((database) => {
    database.sessions.push({
      token,
      userId,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  });

  return token;
}

export async function deleteSession(token: string) {
  return withDatabase((database) => {
    database.sessions = database.sessions.filter((session) => session.token !== token);
  });
}

export async function findUserBySessionToken(token: string) {
  return readDatabase((database) => {
    const session = database.sessions.find((entry) => entry.token === token);
    if (!session) {
      return null;
    }

    const user = database.users.find((entry) => entry.id === session.userId);
    return clone(user ?? null);
  });
}

export async function getWorkspace(userId: string) {
  return readDatabase((database) => {
    const user = database.users.find((entry) => entry.id === userId);
    return clone(user?.workspace ?? createEmptyWorkspace());
  });
}

export async function saveWorkspace(userId: string, workspace: WorkspaceState) {
  return withDatabase((database) => {
    const user = database.users.find((entry) => entry.id === userId);
    if (!user) {
      return null;
    }

    user.workspace = clone(workspace);
    user.updatedAt = new Date().toISOString();
    return clone(user.workspace);
  });
}

export async function updateUserBilling(userId: string, billing: {
  plan?: 'free' | 'pro';
  subscriptionStatus?: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}) {
  return updateUser(userId, (user) => {
    if (billing.plan) {
      user.plan = billing.plan;
    }
    if (billing.subscriptionStatus) {
      user.subscriptionStatus = billing.subscriptionStatus;
    }
    if (billing.stripeCustomerId) {
      user.stripeCustomerId = billing.stripeCustomerId;
    }
    if (billing.stripeSubscriptionId) {
      user.stripeSubscriptionId = billing.stripeSubscriptionId;
    }
  });
}

export async function attachStripeCustomerToUser(userId: string, stripeCustomerId: string) {
  return updateUser(userId, (user) => {
    user.stripeCustomerId = stripeCustomerId;
  });
}

export async function updateUserByStripeCustomerId(
  stripeCustomerId: string,
  mutator: (user: StoredUser) => void,
) {
  return withDatabase((database) => {
    const user = database.users.find((entry) => entry.stripeCustomerId === stripeCustomerId);
    if (!user) {
      return null;
    }

    mutator(user);
    user.updatedAt = new Date().toISOString();
    return clone(user);
  });
}
