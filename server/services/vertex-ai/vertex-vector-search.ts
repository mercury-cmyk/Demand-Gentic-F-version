/**
 * Vertex AI Vector Search Service
 *
 * Provides semantic search capabilities for:
 * - Knowledge base retrieval
 * - Similar account/contact finding
 * - Agent memory and learning
 * - Campaign performance pattern matching
 */

import { generateEmbedding, generateEmbeddings } from "./vertex-client";
import { db } from "../../db";
import { accounts, contacts, callSessions, vectorDocuments } from "@shared/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ==================== CONSTANTS ====================

const VECTOR_DIMENSION = 768;
const DEFAULT_LIMIT = 10;

const parseEnvInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const EMBEDDING_BATCH_SIZE = parseEnvInt(process.env.VECTOR_EMBEDDING_BATCH_SIZE, 50);

// ==================== TYPES ====================

export interface VectorDocument {
  id: string;
  type: "account" | "contact" | "call" | "knowledge" | "campaign";
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
  createdAt: Date;
  accountId?: string | null;
  industry?: string | null;
  disposition?: string | null;
}

export interface SearchResult {
  document: VectorDocument;
  score: number;
  rank: number;
}

type VectorDocumentType = VectorDocument["type"];

// ==================== HELPERS ====================

const toVectorLiteral = (embedding: number[]) => `[${embedding.join(",")}]`;

const buildVectorParams = (embedding: number[]) => {
  const literal = toVectorLiteral(embedding);
  return sql`${literal}::vector`;
};

const normalizeMetadata = (metadata: Record<string, any> | null | undefined) =>
  metadata ?? {};

const upsertDocumentsWithEmbeddings = async (
  docs: VectorDocument[],
  embeddings: number[][]
): Promise<void> => {
  if (docs.length === 0) {
    return;
  }

  const now = new Date();
  const values = docs.map((doc, index) => ({
    sourceType: doc.type,
    sourceId: doc.id,
    content: doc.content,
    embedding: embeddings[index],
    metadata: normalizeMetadata(doc.metadata),
    accountId: doc.accountId ?? null,
    industry: doc.industry ?? null,
    disposition: doc.disposition ?? null,
    updatedAt: now,
  }));

  await db
    .insert(vectorDocuments)
    .values(values)
    .onConflictDoUpdate({
      target: [vectorDocuments.sourceType, vectorDocuments.sourceId],
      set: {
        content: sql`excluded.content`,
        embedding: sql`excluded.embedding`,
        metadata: sql`excluded.metadata`,
        accountId: sql`excluded.account_id`,
        industry: sql`excluded.industry`,
        disposition: sql`excluded.disposition`,
        updatedAt: now,
      },
    });
};

const upsertDocuments = async (docs: VectorDocument[]): Promise<number> => {
  if (docs.length === 0) {
    return 0;
  }

  let total = 0;
  for (let i = 0; i < docs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = docs.slice(i, i + EMBEDDING_BATCH_SIZE);
    const contents = batch.map((doc) => doc.content);
    const embeddings = await generateEmbeddings(contents, "RETRIEVAL_DOCUMENT");
    await upsertDocumentsWithEmbeddings(batch, embeddings);
    total += batch.length;
  }

  return total;
};

const searchDocuments = async (
  type: VectorDocumentType,
  query: string,
  options: {
    limit?: number;
    industryFilter?: string;
    accountId?: string;
    dispositionFilter?: string;
  } = {}
): Promise<SearchResult[]> => {
  const queryEmbedding = await generateEmbedding(query, "RETRIEVAL_QUERY");
  const vectorParam = buildVectorParams(queryEmbedding);
  const limit = options.limit || DEFAULT_LIMIT;

  const filters = [eq(vectorDocuments.sourceType, type)];
  if (type === "account" && options.industryFilter) {
    filters.push(eq(vectorDocuments.industry, options.industryFilter));
  }
  if (type === "contact" && options.accountId) {
    filters.push(eq(vectorDocuments.accountId, options.accountId));
  }
  if (type === "call" && options.dispositionFilter) {
    filters.push(eq(vectorDocuments.disposition, options.dispositionFilter));
  }

  const whereClause = filters.length === 1 ? filters[0] : and(...filters);

  const rows = await db
    .select({
      sourceId: vectorDocuments.sourceId,
      sourceType: vectorDocuments.sourceType,
      content: vectorDocuments.content,
      metadata: vectorDocuments.metadata,
      accountId: vectorDocuments.accountId,
      industry: vectorDocuments.industry,
      disposition: vectorDocuments.disposition,
      createdAt: vectorDocuments.createdAt,
      score: sql<number>`1 - (${vectorDocuments.embedding} <=> ${vectorParam})`,
    })
    .from(vectorDocuments)
    .where(whereClause)
    .orderBy(sql`${vectorDocuments.embedding} <=> ${vectorParam}`)
    .limit(limit);

  return rows.map((row, index) => ({
    document: {
      id: row.sourceId,
      type: row.sourceType as VectorDocumentType,
      content: row.content,
      metadata: normalizeMetadata(row.metadata as Record<string, any> | null),
      createdAt: row.createdAt,
      accountId: row.accountId ?? null,
      industry: row.industry ?? null,
      disposition: row.disposition ?? null,
    },
    score: Number(row.score ?? 0),
    rank: index + 1,
  }));
};

// ==================== INDEXING ====================

/**
 * Index accounts for semantic search
 */
export async function indexAccounts(accountIds?: string[]): Promise<number> {
  let query = db.select().from(accounts);

  if (accountIds && accountIds.length > 0) {
    query = query.where(sql`${accounts.id} = ANY(${accountIds})`) as any;
  }

  const accountList = await query.limit(1000);

  const docs: VectorDocument[] = accountList.map((account) => ({
    id: account.id,
    type: "account",
    content: [
      account.name,
      account.industryStandardized || "",
      account.description || "",
      account.industrySecondary?.join(" ") || "",
      account.employeesSizeRange || "",
      account.revenueRange || "",
      account.hqCity || "",
      account.hqCountry || "",
    ]
      .filter(Boolean)
      .join(" | "),
    metadata: {
      accountId: account.id,
      name: account.name,
      industry: account.industryStandardized,
      domain: account.domain,
    },
    createdAt: new Date(),
    accountId: account.id,
    industry: account.industryStandardized || null,
  }));

  return upsertDocuments(docs);
}

/**
 * Index contacts for semantic search
 */
export async function indexContacts(contactIds?: string[]): Promise<number> {
  let query = db.select().from(contacts);

  if (contactIds && contactIds.length > 0) {
    query = query.where(sql`${contacts.id} = ANY(${contactIds})`) as any;
  }

  const contactList = await query.limit(1000);

  const docs: VectorDocument[] = contactList.map((contact) => ({
    id: contact.id,
    type: "contact",
    content: [
      `${contact.firstName} ${contact.lastName}`,
      contact.jobTitle || "",
      contact.department || "",
      contact.seniorityLevel || "",
    ]
      .filter(Boolean)
      .join(" | "),
    metadata: {
      contactId: contact.id,
      accountId: contact.accountId,
      name: `${contact.firstName} ${contact.lastName}`,
      title: contact.jobTitle,
    },
    createdAt: new Date(),
    accountId: contact.accountId || null,
  }));

  return upsertDocuments(docs);
}

/**
 * Index call transcripts for pattern learning
 */
export async function indexCallTranscripts(limit: number = 100, offset: number = 0): Promise<number> {
  const calls = await db
    .select()
    .from(callSessions)
    .where(sql`${callSessions.aiTranscript} IS NOT NULL AND ${callSessions.aiTranscript} != ''`)
    .orderBy(desc(callSessions.createdAt))
    .limit(limit)
    .offset(offset);

  const docs: VectorDocument[] = calls.map((call) => ({
    id: call.id,
    type: "call",
    content: call.aiTranscript || "",
    metadata: {
      callId: call.id,
      campaignId: call.campaignId,
      disposition: call.aiDisposition,
      duration: call.durationSec,
      createdAt: call.createdAt,
    },
    createdAt: new Date(),
    disposition: call.aiDisposition || null,
  }));

  return upsertDocuments(docs);
}

/**
 * Add knowledge document
 */
export async function addKnowledge(
  id: string,
  content: string,
  metadata: Record<string, any> = {}
): Promise<VectorDocument> {
  const embedding = await generateEmbedding(content, "RETRIEVAL_DOCUMENT");
  const doc: VectorDocument = {
    id,
    type: "knowledge",
    content,
    embedding,
    metadata,
    createdAt: new Date(),
  };

  await upsertDocumentsWithEmbeddings([doc], [embedding]);
  return doc;
}

// ==================== SEARCH ====================

/**
 * Search for similar accounts
 */
export async function findSimilarAccounts(
  query: string,
  options: { limit?: number; industryFilter?: string } = {}
): Promise<SearchResult[]> {
  return searchDocuments("account", query, {
    limit: options.limit,
    industryFilter: options.industryFilter,
  });
}

/**
 * Search for similar contacts
 */
export async function findSimilarContacts(
  query: string,
  options: { limit?: number; accountId?: string } = {}
): Promise<SearchResult[]> {
  return searchDocuments("contact", query, {
    limit: options.limit,
    accountId: options.accountId,
  });
}

/**
 * Search call transcripts for patterns
 */
export async function searchCallPatterns(
  query: string,
  options: { limit?: number; dispositionFilter?: string } = {}
): Promise<SearchResult[]> {
  return searchDocuments("call", query, {
    limit: options.limit,
    dispositionFilter: options.dispositionFilter,
  });
}

/**
 * Search knowledge base
 */
export async function searchKnowledge(
  query: string,
  options: { limit?: number } = {}
): Promise<SearchResult[]> {
  return searchDocuments("knowledge", query, { limit: options.limit });
}

/**
 * Find successful call patterns for a given scenario
 */
export async function findSuccessPatterns(
  scenario: string,
  limit: number = 5
): Promise<{ pattern: string; score: number; disposition: string }[]> {
  const results = await searchCallPatterns(scenario, {
    limit: limit * 2,
    dispositionFilter: "qualified_lead",
  });

  return results.slice(0, limit).map((result) => ({
    pattern: result.document.content.slice(0, 500),
    score: result.score,
    disposition: result.document.disposition || result.document.metadata.disposition,
  }));
}

/**
 * Get vector store stats
 */
export async function getVectorStats(): Promise<Record<string, { documentCount: number; dimension: number }>> {
  const rows = await db
    .select({
      sourceType: vectorDocuments.sourceType,
      count: sql<number>`count(*)`,
    })
    .from(vectorDocuments)
    .groupBy(vectorDocuments.sourceType);

  const baseStats = {
    accounts: { documentCount: 0, dimension: VECTOR_DIMENSION },
    contacts: { documentCount: 0, dimension: VECTOR_DIMENSION },
    calls: { documentCount: 0, dimension: VECTOR_DIMENSION },
    knowledge: { documentCount: 0, dimension: VECTOR_DIMENSION },
  };

  rows.forEach((row) => {
    switch (row.sourceType) {
      case "account":
        baseStats.accounts.documentCount = Number(row.count);
        break;
      case "contact":
        baseStats.contacts.documentCount = Number(row.count);
        break;
      case "call":
        baseStats.calls.documentCount = Number(row.count);
        break;
      case "knowledge":
        baseStats.knowledge.documentCount = Number(row.count);
        break;
      default:
        break;
    }
  });

  return baseStats;
}

// ==================== VERTEX AI MATCHING ENGINE INTEGRATION ====================
// Note: For production scale, integrate with Vertex AI Matching Engine

export interface MatchingEngineConfig {
  projectId: string;
  location: string;
  indexEndpoint: string;
  deployedIndexId: string;
}

/**
 * Initialize Vertex AI Matching Engine (production)
 * This is a placeholder for the full Matching Engine integration
 */
export async function initializeMatchingEngine(config: MatchingEngineConfig): Promise<void> {
  console.log(`[VectorSearch] Matching Engine would be initialized with:`, config);
  console.log(`[VectorSearch] Using pgvector for production indexing in this deployment.`);
}

export default {
  indexAccounts,
  indexContacts,
  indexCallTranscripts,
  addKnowledge,
  findSimilarAccounts,
  findSimilarContacts,
  searchCallPatterns,
  searchKnowledge,
  findSuccessPatterns,
  getVectorStats,
  initializeMatchingEngine,
};
