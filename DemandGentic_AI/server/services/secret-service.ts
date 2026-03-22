import { db } from '../db';
import { encryptJson, decryptJson } from '../lib/encryption';
import { secretStore, SecretEnvironment, SecretStoreRecord } from '@shared/schema';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

const MASTER_KEY = process.env.SECRET_MANAGER_MASTER_KEY || process.env.SESSION_SECRET || '';

function ensureMasterKey() {
  if (!MASTER_KEY) {
    throw new Error('SECRET_MANAGER_MASTER_KEY or SESSION_SECRET must be configured to operate the secret manager');
  }
  return MASTER_KEY;
}

export type SecretSummary = Omit;
export type SecretDetail = SecretSummary & { value: unknown };

export interface SecretListOptions {
  environment?: SecretEnvironment;
  service?: string;
  usageContext?: string;
  isActive?: boolean;
  allowedEnvironments?: SecretEnvironment[];
  limit?: number;
  offset?: number;
}

export async function listSecrets(options: SecretListOptions = {}): Promise {
  const allowedEnvironments = options.allowedEnvironments ?? ['development'];
  const conditions = [];

  if (options.environment) {
    conditions.push(eq(secretStore.environment, options.environment));
  } else if (allowedEnvironments.length) {
    conditions.push(inArray(secretStore.environment, allowedEnvironments));
  }

  if (options.service) {
    conditions.push(eq(secretStore.service, options.service));
  }

  if (options.usageContext) {
    conditions.push(eq(secretStore.usageContext, options.usageContext));
  }

  if (typeof options.isActive === 'boolean') {
    conditions.push(eq(secretStore.isActive, options.isActive));
  }

  const query = db
    .select()
    .from(secretStore)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(secretStore.updatedAt))
    .limit(options.limit ?? 200)
    .offset(options.offset ?? 0);

  const rows = await query;
  return rows.map(mapRecordToSummary);
}

export async function getSecretById(
  id: string,
  allowedEnvironments: SecretEnvironment[] = ['development']
): Promise {
  const record = await fetchSecretRecord(id);
  if (!record) return null;
  if (allowedEnvironments.length && !allowedEnvironments.includes(record.environment)) {
    return null;
  }

  const value = decryptJson(record.encryptedValue, ensureMasterKey());
  return { ...mapRecordToSummary(record), value };
}

export async function createSecret(
  payload: {
    name: string;
    description?: string;
    environment: SecretEnvironment;
    service: string;
    usageContext: string;
    metadata?: Record;
    value: unknown;
    organizationId?: string;
  },
  createdBy: string
): Promise {
  const encryptedValue = encryptJson(payload.value, ensureMasterKey());
  const [created] = await db
    .insert(secretStore)
    .values({
      name: payload.name,
      description: payload.description ?? null,
      environment: payload.environment,
      service: payload.service,
      usageContext: payload.usageContext,
      metadata: payload.metadata ?? {},
      encryptedValue,
      createdBy,
      updatedBy: createdBy,
      organizationId: payload.organizationId ?? null,
    })
    .returning({ id: secretStore.id });

  if (!created) {
    throw new Error('Failed to create secret');
  }

  return created.id;
}

export async function updateSecretMetadata(
  id: string,
  updates: {
    name?: string;
    description?: string;
    environment?: SecretEnvironment;
    service?: string;
    usageContext?: string;
    metadata?: Record;
  },
  updatedBy: string
): Promise {
  const changeSet: Record = {
    updatedBy,
    updatedAt: new Date(),
  };

  if (updates.name) {
    changeSet.name = updates.name;
  }
  if (updates.description !== undefined) {
    changeSet.description = updates.description;
  }
  if (updates.environment) {
    changeSet.environment = updates.environment;
  }
  if (updates.service) {
    changeSet.service = updates.service;
  }
  if (updates.usageContext) {
    changeSet.usageContext = updates.usageContext;
  }
  if (updates.metadata) {
    changeSet.metadata = updates.metadata;
  }

  await db.update(secretStore).set(changeSet).where(eq(secretStore.id, id));
  return getSecretSummary(id);
}

export async function rotateSecret(
  id: string,
  value: unknown,
  rotatedBy: string
): Promise {
  const encryptedValue = encryptJson(value, ensureMasterKey());
  await db.update(secretStore).set({
    encryptedValue,
    version: sql`${secretStore.version} + 1`,
    lastRotatedAt: new Date(),
    rotatedBy,
    updatedBy: rotatedBy,
    updatedAt: new Date(),
  }).where(eq(secretStore.id, id));

  return getSecretSummary(id);
}

export async function deactivateSecret(
  id: string,
  deactivatedBy: string
): Promise {
  await db.update(secretStore).set({
    isActive: false,
    deactivatedAt: new Date(),
    deactivatedBy,
    updatedBy: deactivatedBy,
    updatedAt: new Date(),
  }).where(eq(secretStore.id, id));

  return getSecretSummary(id);
}

export async function activateSecret(
  id: string,
  activatedBy: string
): Promise {
  await db.update(secretStore).set({
    isActive: true,
    deactivatedAt: null,
    deactivatedBy: null,
    updatedBy: activatedBy,
    updatedAt: new Date(),
  }).where(eq(secretStore.id, id));

  return getSecretSummary(id);
}

export async function getSecretSummary(id: string): Promise {
  const record = await fetchSecretRecord(id);
  if (!record) {
    return null;
  }
  return mapRecordToSummary(record);
}

async function fetchSecretRecord(id: string) {
  const rows = await db.select().from(secretStore).where(eq(secretStore.id, id)).limit(1);
  return rows[0] ?? null;
}

function mapRecordToSummary(record: SecretStoreRecord): SecretSummary {
  const { encryptedValue, ...rest } = record;
  return rest;
}